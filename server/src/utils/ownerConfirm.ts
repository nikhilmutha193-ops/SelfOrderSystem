import { Request } from "express";

import Admin from "../models/Admin";
import { HttpError } from "./httpError";
import { comparePassword } from "./password";

/**
 * For actions that can destroy or move all the data: only the owner account, and only with its password typed again.
 * A wrong password is 403, not 401, because a 401 would make the app treat the session as expired and sign the owner out.
 */
export async function assertOwnerPassword(req: Request, password: unknown): Promise<void> {
  if (!req.admin?.isOwner) throw new HttpError(403, "Only the owner account can do this");
  if (typeof password !== "string" || !password) throw new HttpError(400, "Enter your admin password to confirm");
  const admin = await Admin.findOne({ _id: req.auth?.id, restaurantId: req.restaurantId });
  if (!admin || !(await comparePassword(password, admin.passwordHash))) {
    throw new HttpError(403, "That password is not correct");
  }
}
