import { Request, Response } from "express";
import { Types } from "mongoose";

import { asyncHandler } from "../middleware/errorHandler";
import Award from "../models/Award";
import { HttpError } from "../utils/httpError";

function validId(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(400, "Invalid id");
}

export const listAwards = asyncHandler(async (req: Request, res: Response) => {
  const awards = await Award.find({ restaurantId: req.restaurantId }).sort({ sortOrder: 1, createdAt: 1 });
  res.json(awards);
});

export const createAward = asyncHandler(async (req: Request, res: Response) => {
  const { title, issuer, year, imageUrl, description, sortOrder } = req.body as {
    title?: string;
    issuer?: string;
    year?: number;
    imageUrl?: string;
    description?: string;
    sortOrder?: number;
  };
  if (!title) throw new HttpError(400, "title is required");

  const award = await Award.create({
    restaurantId: req.restaurantId,
    title,
    issuer,
    year,
    imageUrl,
    description,
    sortOrder: sortOrder ?? 0,
    isActive: true,
  });
  res.status(201).json(award);
});

export const updateAward = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.id);
  const { title, issuer, year, imageUrl, description, sortOrder } = req.body as {
    title?: string;
    issuer?: string;
    year?: number;
    imageUrl?: string;
    description?: string;
    sortOrder?: number;
  };

  const award = await Award.findOneAndUpdate(
    { _id: req.params.id, restaurantId: req.restaurantId },
    {
      $set: {
        ...(title !== undefined && { title }),
        ...(issuer !== undefined && { issuer }),
        ...(year !== undefined && { year }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(description !== undefined && { description }),
        ...(sortOrder !== undefined && { sortOrder }),
      },
    },
    { new: true }
  );
  if (!award) throw new HttpError(404, "Award not found");
  res.json(award);
});

export const setAwardActive = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.id);
  const { isActive } = req.body as { isActive: boolean };
  const award = await Award.findOneAndUpdate(
    { _id: req.params.id, restaurantId: req.restaurantId },
    { $set: { isActive: !!isActive } },
    { new: true }
  );
  if (!award) throw new HttpError(404, "Award not found");
  res.json(award);
});

export const deleteAward = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.id);
  const result = await Award.findOneAndDelete({ _id: req.params.id, restaurantId: req.restaurantId });
  if (!result) throw new HttpError(404, "Award not found");
  res.status(204).send();
});
