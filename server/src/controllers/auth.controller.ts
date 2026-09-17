import { randomUUID } from "crypto";
import { Request, Response } from "express";
import Admin, { IAdmin } from "../models/Admin";
import Chef from "../models/Chef";
import TableModel from "../models/Table";
import { asyncHandler } from "../middleware/errorHandler";
import { HttpError } from "../utils/httpError";
import { comparePassword, hashPassword } from "../utils/password";
import { signToken } from "../utils/jwt";
import { decryptTableToken } from "../utils/tableToken";

/** Credentials must be plain strings; anything else is a malformed or crafted request. */
function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(400, `${field} is required`);
  }
  return value;
}

export const adminLogin = asyncHandler(async (req: Request, res: Response) => {
  const username = requireString(req.body?.username, "username");
  const password = requireString(req.body?.password, "password");

  const admin = await Admin.findOne({ restaurantId: req.restaurantId, username });
  if (!admin || !(await comparePassword(password, admin.passwordHash))) {
    throw new HttpError(401, "Invalid username or password");
  }

  // Restaurants created before per-module permissions have no owner flagged; the
  // earliest account is the original admin, so promote it rather than lock it out.
  if (!admin.isOwner && !(await Admin.exists({ restaurantId: req.restaurantId, isOwner: true }))) {
    const earliest = await Admin.findOne({ restaurantId: req.restaurantId }).sort({ createdAt: 1 });
    if (earliest && earliest._id.equals(admin._id)) {
      admin.isOwner = true;
      await admin.save();
    }
  }

  const token = signToken({ role: "admin", restaurantId: req.restaurantId!, id: admin._id.toString() });
  res.json({ token, admin: adminProfile(admin) });
});

function adminProfile(admin: IAdmin) {
  return {
    id: admin._id,
    username: admin.username,
    isOwner: admin.isOwner,
    permissions: Object.fromEntries(admin.permissions ?? []),
  };
}

export const adminMe = asyncHandler(async (req: Request, res: Response) => {
  const admin = await Admin.findById(req.auth!.id);
  if (!admin) throw new HttpError(401, "Admin account no longer exists");
  res.json(adminProfile(admin));
});

export const adminSecurityQuestion = asyncHandler(async (req: Request, res: Response) => {
  const username = requireString(req.query?.username, "username");
  const admin = await Admin.findOne({ restaurantId: req.restaurantId, username });
  if (!admin) throw new HttpError(404, "No admin account with that username");
  res.json({ securityQuestion: admin.securityQuestion });
});

export const adminForgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const username = requireString(req.body?.username, "username");
  const securityAnswer = requireString(req.body?.securityAnswer, "securityAnswer");
  const newPassword = requireString(req.body?.newPassword, "newPassword");
  if (newPassword.length < 6) throw new HttpError(400, "newPassword must be at least 6 characters");

  const admin = await Admin.findOne({ restaurantId: req.restaurantId, username });
  if (!admin || !(await comparePassword(securityAnswer, admin.securityAnswerHash))) {
    throw new HttpError(401, "Security answer did not match");
  }
  admin.passwordHash = await hashPassword(newPassword);
  await admin.save();
  res.json({ message: "Password updated successfully" });
});

export const adminChangePassword = asyncHandler(async (req: Request, res: Response) => {
  const oldPassword = requireString(req.body?.oldPassword, "oldPassword");
  const newPassword = requireString(req.body?.newPassword, "newPassword");
  if (newPassword.length < 6) throw new HttpError(400, "newPassword must be at least 6 characters");

  const admin = await Admin.findById(req.auth!.id);
  if (!admin || !(await comparePassword(oldPassword, admin.passwordHash))) {
    throw new HttpError(401, "Current password is incorrect");
  }
  admin.passwordHash = await hashPassword(newPassword);
  await admin.save();
  res.json({ message: "Password updated successfully" });
});

export const chefLogin = asyncHandler(async (req: Request, res: Response) => {
  const username = requireString(req.body?.username, "username");
  const password = requireString(req.body?.password, "password");

  const chef = await Chef.findOne({ restaurantId: req.restaurantId, username });
  if (!chef || !(await comparePassword(password, chef.passwordHash))) {
    throw new HttpError(401, "Invalid username or password");
  }

  const token = signToken({ role: "chef", restaurantId: req.restaurantId!, id: chef._id.toString() });
  res.json({ token, chef: { id: chef._id, username: chef.username } });
});

export const tableLogin = asyncHandler(async (req: Request, res: Response) => {
  const { code, token: qrToken, password } = req.body as { code?: unknown; token?: unknown; password?: unknown };
  if (!code && !qrToken) throw new HttpError(400, "code or token is required");

  let table;
  if (qrToken) {
    // Scanning the encrypted, table-specific QR code already proves this is the physical table stand -
    // no PIN needed on top of that (unlike the bare-code fallback below, which anyone could type in).
    const decrypted = decryptTableToken(requireString(qrToken, "token"));
    if (!decrypted || decrypted.restaurantId !== req.restaurantId) {
      throw new HttpError(401, "Invalid or expired QR code");
    }
    table = await TableModel.findOne({ _id: decrypted.tableId, restaurantId: req.restaurantId });
    if (!table) throw new HttpError(401, "Invalid or expired QR code");
  } else {
    const tableCode = requireString(code, "code");
    const tablePassword = requireString(password, "password");
    table = await TableModel.findOne({ restaurantId: req.restaurantId, code: tableCode });
    if (!table || !(await comparePassword(tablePassword, table.passwordHash))) {
      throw new HttpError(401, "Invalid table code or password");
    }
  }

  // A guest/counter table is shared - several walk-ins can order from it at once,
  // so it is never marked occupied and never blocks a new sign-in.
  if (!table.isGuest && table.status === "occupied") {
    throw new HttpError(409, "This table is already occupied");
  }

  let sessionId: string | undefined;
  if (!table.isGuest) {
    // A fresh id per seating: releasing the table clears it, which invalidates the
    // token the previous guest is still holding.
    sessionId = randomUUID();
    table.status = "occupied";
    table.sessionId = sessionId;
    table.occupiedAt = new Date();
    await table.save();
  }

  const token = signToken({
    role: "table",
    restaurantId: req.restaurantId!,
    id: table._id.toString(),
    tableId: table._id.toString(),
    sessionId,
  });
  res.json({ token, table: { id: table._id, code: table.code } });
});
