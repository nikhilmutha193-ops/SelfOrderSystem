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

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The search tags of the landing page as HTML head lines, from Admin > Landing page > Google search. The client's
 * web server (nginx SSI) puts this into index.html before it is sent, so Google sees the title, description and
 * keywords in the first HTML, not only after the page's script has run.
 */
export const getLandingSeoHead = asyncHandler(async (req: Request, res: Response) => {
  const [restaurant, content] = await Promise.all([
    Restaurant.findById(req.restaurantId).select("name address logoUrl").lean(),
    getOrCreateLandingContent(req.restaurantId!),
  ]);
  const seo = content.seo;
  const name = (restaurant?.name ?? "Restaurant").replace(/\s+/g, " ");
  const title = seo?.title?.trim() || name;
  const description = seo?.description?.trim() ?? "";
  const keywords = seo?.keywords?.trim() ?? "";
  const proto = (req.get("x-forwarded-proto") || req.protocol).split(",")[0];
  const origin = `${proto}://${req.get("x-forwarded-host") || req.get("host")}`;
  const absolute = (url: string) => (/^https?:\/\//.test(url) ? url : `${origin}${url.startsWith("/") ? "" : "/"}${url}`);
  const image = seo?.imageUrl || restaurant?.logoUrl || "";

  const lines = [`<title>${escapeHtml(title)}</title>`];
  const meta = (attr: "name" | "property", key: string, value: string) =>
    value && lines.push(`<meta ${attr}="${key}" content="${escapeHtml(value)}" />`);
  meta("name", "description", description);
  meta("name", "keywords", keywords);
  if (seo?.title || description) {
    meta("property", "og:title", title);
    meta("property", "og:description", description);
    meta("property", "og:type", "restaurant");
    if (image) meta("property", "og:image", absolute(image));
  }
  if (seo?.structuredData !== false && restaurant) {
    const data = {
      "@context": "https://schema.org",
      "@type": "Restaurant",
      name,
      url: origin,
      ...(description && { description }),
      ...(keywords && { keywords }),
      ...(restaurant.address && { address: restaurant.address }),
      ...(image && { image: absolute(image) }),
    };
    lines.push(`<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`);
  }
  res.type("html").set("Cache-Control", "public, max-age=60").send(lines.join("\n"));
});

/** A dish is on the landing page when the owner switched it on, or has not chosen and it is a bestseller. */
export const ON_LANDING = {
  $or: [{ showOnLanding: true }, { showOnLanding: { $exists: false }, isBestseller: true }],
};

export const getLandingPage = asyncHandler(async (req: Request, res: Response) => {
  // Google reviews are copied into the review list (each once), so the admin can hide any of them by hand.
  await syncGoogleReviewsIfStale(req.restaurantId!);
  const [restaurant, team, bestsellers, todaySpecialItems, categories, banners, reviews, awards, googleDocs, content] =
    await Promise.all([
      Restaurant.findById(req.restaurantId).select("name nameStyle tagline aboutText heroImages logoUrl address"),
      TeamMember.find({ restaurantId: req.restaurantId, isActive: true }).sort({ sortOrder: 1, createdAt: 1 }),
      FoodItem.find({ restaurantId: req.restaurantId, isActive: true, ...ON_LANDING }).sort({ name: 1 }),
      FoodItem.find({ restaurantId: req.restaurantId, isActive: true, isTodaySpecial: true }).sort({ name: 1 }),
      Category.find({ restaurantId: req.restaurantId, isActive: true }).sort({ name: 1 }),
      PromoBanner.find({ restaurantId: req.restaurantId, isActive: true }).sort({ sortOrder: 1, createdAt: 1 }),
      Review.find({ restaurantId: req.restaurantId, isApproved: true, source: { $ne: "google" } })
        .sort({ createdAt: -1 })
        .limit(60),
      Award.find({ restaurantId: req.restaurantId, isActive: true }).sort({ sortOrder: 1, createdAt: 1 }),
      Review.find({ restaurantId: req.restaurantId, isApproved: true, source: "google" })
        .sort({ createdAt: -1 })
        .limit(60),
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
