import { Request, Response } from "express";
import { HydratedDocument } from "mongoose";

import { asyncHandler } from "../middleware/errorHandler";
import Admin, { IAdmin } from "../models/Admin";
import { HttpError } from "../utils/httpError";
import { hashPassword } from "../utils/password";
import { MODULES, sanitizePermissions } from "../utils/permissions";

function toDto(admin: IAdmin) {
  return {
    id: admin._id,
    username: admin.username,
    isOwner: admin.isOwner,
    permissions: Object.fromEntries(admin.permissions ?? []),
    createdAt: admin.createdAt,
  };
}

export const listModules = asyncHandler(async (_req: Request, res: Response) => {
  res.json(MODULES);
});

export const listAdmins = asyncHandler(async (req: Request, res: Response) => {
  const admins = await Admin.find({ restaurantId: req.restaurantId }).sort({ createdAt: 1 });
  res.json(admins.map(toDto));
});

export const createAdmin = asyncHandler(async (req: Request, res: Response) => {
  const { username, password, securityQuestion, securityAnswer, permissions } = req.body as {
    username?: string;
    password?: string;
    securityQuestion?: string;
    securityAnswer?: string;
    permissions?: unknown;
  };
  if (!username || !password) throw new HttpError(400, "username and password are required");
  if (password.length < 6) throw new HttpError(400, "password must be at least 6 characters");

  const exists = await Admin.findOne({ restaurantId: req.restaurantId, username: username.trim() });
  if (exists) throw new HttpError(409, "An admin with that username already exists");

  const admin = await Admin.create({
    restaurantId: req.restaurantId,
    username: username.trim(),
    passwordHash: await hashPassword(password),
    securityQuestion: securityQuestion || "Who created this account?",
    securityAnswerHash: await hashPassword(securityAnswer || username.trim()),
    isOwner: false,
    permissions: sanitizePermissions(permissions),
  });

  res.status(201).json(toDto(admin));
});

async function findOwnAdmin(req: Request): Promise<HydratedDocument<IAdmin>> {
  const admin = await Admin.findOne({ _id: req.params.id, restaurantId: req.restaurantId });
  if (!admin) throw new HttpError(404, "Admin not found");
  return admin;
}

export const updateAdminPermissions = asyncHandler(async (req: Request, res: Response) => {
  const admin = await findOwnAdmin(req);
  // The owner keeps full access by definition, so there is nothing to edit.
  if (admin.isOwner) throw new HttpError(400, "The owner account always has full access");

  admin.permissions = new Map(Object.entries(sanitizePermissions(req.body?.permissions)));
  await admin.save();
  res.json(toDto(admin));
});

export const resetAdminPassword = asyncHandler(async (req: Request, res: Response) => {
  const { newPassword } = req.body as { newPassword?: string };
  if (!newPassword || newPassword.length < 6) {
    throw new HttpError(400, "newPassword must be at least 6 characters");
  }
  const admin = await findOwnAdmin(req);
  admin.passwordHash = await hashPassword(newPassword);
  admin.tokenVersion = (admin.tokenVersion ?? 0) + 1;
  await admin.save();
  res.json({ message: "Password updated successfully" });
});

export const deleteAdmin = asyncHandler(async (req: Request, res: Response) => {
  const admin = await findOwnAdmin(req);
  if (admin.isOwner) throw new HttpError(400, "The owner account cannot be deleted");
  if (admin._id.toString() === req.auth!.id) throw new HttpError(400, "You cannot delete your own account");

  await Admin.deleteOne({ _id: admin._id });
  res.json({ message: "Admin deleted" });
});
