import { Request, Response } from "express";
import { Types } from "mongoose";

import { asyncHandler } from "../middleware/errorHandler";
import Chef from "../models/Chef";
import { HttpError } from "../utils/httpError";
import { hashPassword } from "../utils/password";

function validId(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(400, "Invalid id");
}

export const listChefs = asyncHandler(async (req: Request, res: Response) => {
  const chefs = await Chef.find({ restaurantId: req.restaurantId }).select("-passwordHash").sort({ username: 1 });
  res.json(chefs);
});

export const createChef = asyncHandler(async (req: Request, res: Response) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) throw new HttpError(400, "username and password are required");
  if (password.length < 4) throw new HttpError(400, "password must be at least 4 characters");

  const existing = await Chef.findOne({ restaurantId: req.restaurantId, username });
  if (existing) throw new HttpError(409, "A chef with that username already exists");

  const passwordHash = await hashPassword(password);
  const chef = await Chef.create({ restaurantId: req.restaurantId, username, passwordHash, password });
  res.status(201).json({ id: chef._id, username: chef.username, password: chef.password });
});

export const updateChef = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.id);
  const { password } = req.body as { password?: string };
  if (!password) throw new HttpError(400, "password is required");
  if (password.length < 4) throw new HttpError(400, "password must be at least 4 characters");

  const chef = await Chef.findOneAndUpdate(
    { _id: req.params.id, restaurantId: req.restaurantId },
    { $set: { passwordHash: await hashPassword(password), password } },
    { new: true }
  ).select("-passwordHash");
  if (!chef) throw new HttpError(404, "Chef not found");
  res.json(chef);
});

export const deleteChef = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.id);
  const chef = await Chef.findOneAndDelete({ _id: req.params.id, restaurantId: req.restaurantId });
  if (!chef) throw new HttpError(404, "Chef not found");
  res.json({ message: "Chef removed" });
});
