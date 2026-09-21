import { Request, Response } from "express";
import { Types } from "mongoose";
import Review from "../models/Review";
import FoodReview from "../models/FoodReview";
import FoodItem from "../models/FoodItem";
import { asyncHandler } from "../middleware/errorHandler";
import { HttpError } from "../utils/httpError";

function validId(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(400, "Invalid id");
}

/**
 * A guest rating (1-5) for a single dish, tied to their order so each dish is rated once.
 * The dish's running total (reviewSum/reviewCount) is bumped so the menu average stays cheap
 * to read without scanning every review.
 */
export const submitFoodReview = asyncHandler(async (req: Request, res: Response) => {
  const { foodItemId, rating, comment } = req.body as { foodItemId?: string; rating?: number; comment?: string };
  if (!foodItemId || !Types.ObjectId.isValid(foodItemId)) throw new HttpError(400, "A valid foodItemId is required");
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new HttpError(400, "rating must be an integer between 1 and 5");
  }
  const food = await FoodItem.findOne({ _id: foodItemId, restaurantId: req.restaurantId });
  if (!food) throw new HttpError(404, "Food item not found");

  const orderId = req.auth?.orderId;
  try {
    await FoodReview.create({
      restaurantId: req.restaurantId,
      foodItemId,
      ...(orderId && { orderId }),
      rating,
      comment: comment?.trim() || "",
    });
  } catch (err) {
    // Duplicate (already rated this dish on this order) - report it cleanly, don't double-count.
    if ((err as { code?: number }).code === 11000) throw new HttpError(409, "You've already rated this dish");
    throw err;
  }
  await FoodItem.updateOne({ _id: foodItemId }, { $inc: { reviewSum: rating, reviewCount: 1 } });
  res.status(201).json({ message: "Thanks for rating!" });
});

export const submitReview = asyncHandler(async (req: Request, res: Response) => {
  const { customerName, rating, comment } = req.body as {
    customerName?: string;
    rating?: number;
    comment?: string;
  };
  if (!customerName?.trim()) {
    throw new HttpError(400, "customerName is required");
  }
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new HttpError(400, "rating must be an integer between 1 and 5");
  }

  const review = await Review.create({
    restaurantId: req.restaurantId,
    tableId: req.auth?.tableId,
    customerName: customerName.trim(),
    rating,
    comment: comment?.trim() || "",
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
