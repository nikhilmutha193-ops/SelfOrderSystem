import { Request, Response } from "express";

import { asyncHandler } from "../middleware/errorHandler";
import Award from "../models/Award";
import FoodItem from "../models/FoodItem";
import Restaurant from "../models/Restaurant";
import Review from "../models/Review";
import TeamMember from "../models/TeamMember";
import { getGoogleReviews } from "../utils/googleReviews";
import { HttpError } from "../utils/httpError";
import { getOrCreateLandingContent } from "./landingContent.controller";

export const getLandingPage = asyncHandler(async (req: Request, res: Response) => {
  const [restaurant, team, bestsellers, reviews, awards, googleReviews, content] = await Promise.all([
    Restaurant.findById(req.restaurantId).select("name tagline aboutText heroImages logoUrl address"),
    TeamMember.find({ restaurantId: req.restaurantId, isActive: true }).sort({ sortOrder: 1, createdAt: 1 }),
    FoodItem.find({ restaurantId: req.restaurantId, isActive: true, isBestseller: true }).sort({ name: 1 }),
    Review.find({ restaurantId: req.restaurantId, isApproved: true }).sort({ createdAt: -1 }).limit(20),
    Award.find({ restaurantId: req.restaurantId, isActive: true }).sort({ sortOrder: 1, createdAt: 1 }),
    getGoogleReviews(),
    getOrCreateLandingContent(req.restaurantId!),
  ]);
  if (!restaurant) throw new HttpError(404, "Restaurant not found");

  res.json({ restaurant, team, bestsellers, reviews, awards, googleReviews, content });
});
