import { randomUUID } from "crypto";
import { Request, Response } from "express";

import { asyncHandler } from "../middleware/errorHandler";
import Admin, { IAdmin } from "../models/Admin";
import Chef from "../models/Chef";
import Order from "../models/Order";
import TableModel from "../models/Table";
import { HttpError } from "../utils/httpError";
import { AuthTokenPayload, nowSeconds, signToken, staffSessionMaxSeconds } from "../utils/jwt";
import { comparePassword, hashPassword } from "../utils/password";
import { cancelUnsentOrdersForTables } from "../utils/tableRelease";
import { decryptTableToken } from "../utils/tableToken";

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

  if (!admin.isOwner && !(await Admin.exists({ restaurantId: req.restaurantId, isOwner: true }))) {
    const earliest = await Admin.findOne({ restaurantId: req.restaurantId }).sort({ createdAt: 1 });
    if (earliest && earliest._id.equals(admin._id)) {
      admin.isOwner = true;
      await admin.save();
    }
  }

  const token = signToken({
    role: "admin",
    restaurantId: req.restaurantId!,
    id: admin._id.toString(),
    tv: admin.tokenVersion ?? 0,
    sst: nowSeconds(),
  });
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
  admin.tokenVersion = (admin.tokenVersion ?? 0) + 1;
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
  admin.tokenVersion = (admin.tokenVersion ?? 0) + 1;
  await admin.save();
  const token = signToken({
    role: "admin",
    restaurantId: req.restaurantId!,
    id: admin._id.toString(),
    tv: admin.tokenVersion,
    dev: req.auth!.dev,
    sst: nowSeconds(),
  });
  res.json({ message: "Password updated successfully", token });
});

export const chefLogin = asyncHandler(async (req: Request, res: Response) => {
  const username = requireString(req.body?.username, "username");
  const password = requireString(req.body?.password, "password");

  const chef = await Chef.findOne({ restaurantId: req.restaurantId, username });
  if (!chef || !(await comparePassword(password, chef.passwordHash))) {
    throw new HttpError(401, "Invalid username or password");
  }

  const token = signToken({
    role: "chef",
    restaurantId: req.restaurantId!,
    id: chef._id.toString(),
    tv: chef.tokenVersion ?? 0,
    dev: req.body?.keepSignedIn === true,
    sst: nowSeconds(),
  });
  res.json({ token, chef: { id: chef._id, username: chef.username } });
});

export const tableLogin = asyncHandler(async (req: Request, res: Response) => {
  const {
    code,
    token: qrToken,
    password,
    currentTableId,
    startNewOrder,
    continueOrder,
  } = req.body as {
    code?: unknown;
    token?: unknown;
    password?: unknown;
    currentTableId?: unknown;
    startNewOrder?: unknown;
    continueOrder?: unknown;
  };
  if (!code && !qrToken) throw new HttpError(400, "code or token is required");

  let table;
  if (qrToken) {
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

  if (!table.isGuest && table.status === "occupied") {
    const provedIdentity = !qrToken || (typeof currentTableId === "string" && currentTableId === table._id.toString());
    if (!provedIdentity) {
      throw new HttpError(409, "This table is already occupied");
    }
    if (startNewOrder === true) {
      await cancelUnsentOrdersForTables([table._id]);
      // status/sessionId are overwritten just below regardless, so nothing else to reset here.
    } else if (continueOrder === true) {
      const openOrder = await Order.findOne({ tableId: table._id, status: { $in: ["open", "billed"] } }).sort({
        createdAt: -1,
      });
      const token = signToken({
        role: "table",
        restaurantId: req.restaurantId!,
        id: table._id.toString(),
        tableId: table._id.toString(),
        sessionId: table.sessionId,
        ...(openOrder && { orderId: openOrder._id.toString() }),
      });
      res.json({ token, table: { id: table._id, code: table.code } });
      return;
    } else {
      throw new HttpError(409, "You already have an order in progress at this table");
    }
  }

  let sessionId: string | undefined;
  if (!table.isGuest) {
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

export const refreshSession = asyncHandler(async (req: Request, res: Response) => {
  const auth = req.auth!;
  const startedAt = auth.sst ?? nowSeconds();
  if (nowSeconds() - startedAt > staffSessionMaxSeconds(auth)) {
    throw new HttpError(401, "Your session has ended. Please sign in again.");
  }

  const payload: AuthTokenPayload = {
    role: auth.role,
    restaurantId: auth.restaurantId,
    id: auth.id,
    tv: auth.tv ?? 0,
    dev: auth.dev,
    sst: startedAt,
  };
  res.json({ token: signToken(payload) });
});
