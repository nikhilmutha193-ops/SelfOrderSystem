import { Request, Response } from "express";
import Admin from "../models/Admin";
import Chef from "../models/Chef";
import TableModel from "../models/Table";
import { asyncHandler } from "../middleware/errorHandler";
import { HttpError } from "../utils/httpError";
import { comparePassword, hashPassword } from "../utils/password";
import { signToken } from "../utils/jwt";
import { decryptTableToken } from "../utils/tableToken";

export const adminLogin = asyncHandler(async (req: Request, res: Response) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) throw new HttpError(400, "username and password are required");

  const admin = await Admin.findOne({ restaurantId: req.restaurantId, username });
  if (!admin || !(await comparePassword(password, admin.passwordHash))) {
    throw new HttpError(401, "Invalid username or password");
  }

  const token = signToken({ role: "admin", restaurantId: req.restaurantId!, id: admin._id.toString() });
  res.json({ token, admin: { id: admin._id, username: admin.username } });
});

export const adminSecurityQuestion = asyncHandler(async (req: Request, res: Response) => {
  const { username } = req.query as { username?: string };
  if (!username) throw new HttpError(400, "username is required");
  const admin = await Admin.findOne({ restaurantId: req.restaurantId, username });
  if (!admin) throw new HttpError(404, "No admin account with that username");
  res.json({ securityQuestion: admin.securityQuestion });
});

export const adminForgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { username, securityAnswer, newPassword } = req.body as {
    username?: string;
    securityAnswer?: string;
    newPassword?: string;
  };
  if (!username || !securityAnswer || !newPassword) {
    throw new HttpError(400, "username, securityAnswer and newPassword are required");
  }
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
  const { oldPassword, newPassword } = req.body as { oldPassword?: string; newPassword?: string };
  if (!oldPassword || !newPassword) throw new HttpError(400, "oldPassword and newPassword are required");
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
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) throw new HttpError(400, "username and password are required");

  const chef = await Chef.findOne({ restaurantId: req.restaurantId, username });
  if (!chef || !(await comparePassword(password, chef.passwordHash))) {
    throw new HttpError(401, "Invalid username or password");
  }

  const token = signToken({ role: "chef", restaurantId: req.restaurantId!, id: chef._id.toString() });
  res.json({ token, chef: { id: chef._id, username: chef.username } });
});

export const tableLogin = asyncHandler(async (req: Request, res: Response) => {
  const { code, token: qrToken, password } = req.body as { code?: string; token?: string; password?: string };
  if (!code && !qrToken) throw new HttpError(400, "code or token is required");

  let table;
  if (qrToken) {
    // Scanning the encrypted, table-specific QR code already proves this is the physical table stand -
    // no PIN needed on top of that (unlike the bare-code fallback below, which anyone could type in).
    const decrypted = decryptTableToken(qrToken);
    if (!decrypted || decrypted.restaurantId !== req.restaurantId) {
      throw new HttpError(401, "Invalid or expired QR code");
    }
    table = await TableModel.findOne({ _id: decrypted.tableId, restaurantId: req.restaurantId });
    if (!table) throw new HttpError(401, "Invalid or expired QR code");
  } else {
    if (!password) throw new HttpError(400, "password is required");
    table = await TableModel.findOne({ restaurantId: req.restaurantId, code });
    if (!table || !(await comparePassword(password, table.passwordHash))) {
      throw new HttpError(401, "Invalid table code or password");
    }
  }

  if (table.status === "occupied") {
    throw new HttpError(409, "This table is already occupied");
  }

  table.status = "occupied";
  await table.save();

  const token = signToken({
    role: "table",
    restaurantId: req.restaurantId!,
    id: table._id.toString(),
    tableId: table._id.toString(),
  });
  res.json({ token, table: { id: table._id, code: table.code } });
});
