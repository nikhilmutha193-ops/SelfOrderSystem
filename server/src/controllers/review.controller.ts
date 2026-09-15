import { Request, Response } from "express";
import { Types } from "mongoose";
import Review from "../models/Review";
import { asyncHandler } from "../middleware/errorHandler";
import { HttpError } from "../utils/httpError";

function validId(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(400, "Invalid id");
}

export const submitReview = asyncHandler(async (req: Request, res: Response) => {
  const { customerName, rating, comment } = req.body as {
    customerName?: string;
    rating?: number;
    comment?: string;
  };
  if (!customerName?.trim() || !comment?.trim()) {
    throw new HttpError(400, "customerName and comment are required");
  }
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new HttpError(400, "rating must be an integer between 1 and 5");
  }

  const review = await Review.create({
    restaurantId: req.restaurantId,
    tableId: req.auth?.tableId,
    customerName: customerName.trim(),
    rating,
    comment: comment.trim(),
    isApproved: false,
  });
  res.status(201).json(review);
});

export const listReviews = asyncHandler(async (req: Request, res: Response) => {
  const reviews = await Review.find({ restaurantId: req.restaurantId })
    .populate("tableId", "code")
    .sort({ createdAt: -1 });
  res.json(reviews);
});

export const setReviewApproved = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.id);
  const { isApproved } = req.body as { isApproved: boolean };
  const review = await Review.findOneAndUpdate(
    { _id: req.params.id, restaurantId: req.restaurantId },
    { $set: { isApproved: !!isApproved } },
    { new: true }
  );
  if (!review) throw new HttpError(404, "Review not found");
  res.json(review);
});

export const deleteReview = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.id);
  const result = await Review.findOneAndDelete({ _id: req.params.id, restaurantId: req.restaurantId });
  if (!result) throw new HttpError(404, "Review not found");
  res.status(204).send();
});
