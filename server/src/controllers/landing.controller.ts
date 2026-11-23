import { Request, Response } from "express";

import { asyncHandler } from "../middleware/errorHandler";
import Award from "../models/Award";
import Category, { ICategory } from "../models/Category";
import FoodItem from "../models/FoodItem";
import PromoBanner from "../models/PromoBanner";
import Restaurant from "../models/Restaurant";
import Review from "../models/Review";
import TeamMember from "../models/TeamMember";
import { syncGoogleReviewsIfStale } from "../utils/reviewSync";
import { HttpError } from "../utils/httpError";
import { getOrCreateLandingContent } from "./landingContent.controller";

/** Today's Special dishes, grouped under their real menu category - categories with none of
 *  today's specials are left out rather than shown empty. */
function groupByCategory(items: { categoryId: { toString(): string }; name: string }[], categories: ICategory[]) {
  return categories
    .map((category) => ({
      categoryId: category._id,
      categoryName: category.name,
      items: items.filter((item) => item.categoryId.toString() === category._id.toString()),
    }))
    .filter((group) => group.items.length > 0);
}

/** A dish is on the landing page when the owner switched it on, or has not chosen and it is a bestseller. */
export const ON_LANDING = {
  $or: [{ showOnLanding: true }, { showOnLanding: { $exists: false }, isBestseller: true }],
};

export const getLandingPage = asyncHandler(async (req: Request, res: Response) => {
  // Google reviews are copied into the review list (each once), so the admin can hide any of them by hand.
  await syncGoogleReviewsIfStale(req.restaurantId!);
  const [restaurant, team, bestsellers, todaySpecialItems, categories, banners, reviews, awards, googleDocs, content] =
    await Promise.all([
      Restaurant.findById(req.restaurantId).select("name tagline aboutText heroImages logoUrl address"),
      TeamMember.find({ restaurantId: req.restaurantId, isActive: true }).sort({ sortOrder: 1, createdAt: 1 }),
      FoodItem.find({ restaurantId: req.restaurantId, isActive: true, ...ON_LANDING }).sort({ name: 1 }),
      FoodItem.find({ restaurantId: req.restaurantId, isActive: true, isTodaySpecial: true }).sort({ name: 1 }),
      Category.find({ restaurantId: req.restaurantId, isActive: true }).sort({ name: 1 }),
      PromoBanner.find({ restaurantId: req.restaurantId, isActive: true }).sort({ sortOrder: 1, createdAt: 1 }),
      Review.find({ restaurantId: req.restaurantId, isApproved: true, source: { $ne: "google" } })
        .sort({ createdAt: -1 })
        .limit(20),
      Award.find({ restaurantId: req.restaurantId, isActive: true }).sort({ sortOrder: 1, createdAt: 1 }),
      Review.find({ restaurantId: req.restaurantId, isApproved: true, source: "google" })
        .sort({ createdAt: -1 })
        .limit(20),
      getOrCreateLandingContent(req.restaurantId!),
    ]);
  if (!restaurant) throw new HttpError(404, "Restaurant not found");

  const todaySpecials = groupByCategory(todaySpecialItems, categories);
  const googleReviews = googleDocs.map((r) => ({
    author: r.customerName,
    rating: r.rating,
    text: r.comment,
    relativeDate: r.relativeDate,
    profilePhotoUrl: r.profilePhotoUrl,
  }));

  res.json({ restaurant, team, bestsellers, todaySpecials, banners, reviews, awards, googleReviews, content });
});
