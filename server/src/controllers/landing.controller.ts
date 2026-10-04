import { Request, Response } from "express";

import { asyncHandler } from "../middleware/errorHandler";
import Award from "../models/Award";
import Category, { ICategory } from "../models/Category";
import FoodItem from "../models/FoodItem";
import PromoBanner from "../models/PromoBanner";
import Restaurant from "../models/Restaurant";
import Review from "../models/Review";
import TeamMember from "../models/TeamMember";
import { getGoogleReviews } from "../utils/googleReviews";
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

export const getLandingPage = asyncHandler(async (req: Request, res: Response) => {
  const [restaurant, team, bestsellers, todaySpecialItems, categories, banners, reviews, awards, googleReviews, content] =
    await Promise.all([
      Restaurant.findById(req.restaurantId).select("name tagline aboutText heroImages logoUrl address"),
      TeamMember.find({ restaurantId: req.restaurantId, isActive: true }).sort({ sortOrder: 1, createdAt: 1 }),
      FoodItem.find({ restaurantId: req.restaurantId, isActive: true, isBestseller: true }).sort({ name: 1 }),
      FoodItem.find({ restaurantId: req.restaurantId, isActive: true, isTodaySpecial: true }).sort({ name: 1 }),
      Category.find({ restaurantId: req.restaurantId, isActive: true }).sort({ name: 1 }),
      PromoBanner.find({ restaurantId: req.restaurantId, isActive: true }).sort({ sortOrder: 1, createdAt: 1 }),
      Review.find({ restaurantId: req.restaurantId, isApproved: true }).sort({ createdAt: -1 }).limit(20),
      Award.find({ restaurantId: req.restaurantId, isActive: true }).sort({ sortOrder: 1, createdAt: 1 }),
      getGoogleReviews(),
      getOrCreateLandingContent(req.restaurantId!),
    ]);
  if (!restaurant) throw new HttpError(404, "Restaurant not found");

  const todaySpecials = groupByCategory(todaySpecialItems, categories);

  res.json({ restaurant, team, bestsellers, todaySpecials, banners, reviews, awards, googleReviews, content });
});
