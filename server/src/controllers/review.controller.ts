import { Request, Response } from "express";
import { Types } from "mongoose";

import { asyncHandler } from "../middleware/errorHandler";
import FoodItem from "../models/FoodItem";
import FoodReview from "../models/FoodReview";
import GoogleReviewsConfig from "../models/GoogleReviewsConfig";
import Restaurant from "../models/Restaurant";
import Review from "../models/Review";
import { HttpError } from "../utils/httpError";
import { sealSecret } from "../utils/secretBox";
import { feedbackKey, googleConfigured, syncGoogleReviews } from "../utils/reviewSync";

function validId(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(400, "Invalid id");
}

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

const FEEDBACK_QR_DEFAULTS = {
  showLogo: true,
  showName: true,
  showAddress: false,
  heading: "Rate your visit",
  instructionText: "Scan to share your feedback",
  accentColor: "#ea580c",
};

const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The same feedback twice within a day (a double tap, a refresh, scanning again) is kept once. */
async function findRecentDuplicate(restaurantId: string, dupKey: string) {
  return Review.findOne({
    restaurantId,
    dupKey,
    createdAt: { $gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
  });
}

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

  const dupKey = feedbackKey(customerName, rating, comment ?? "");
  const existing = await findRecentDuplicate(req.restaurantId!, dupKey);
  if (existing) return res.status(200).json(existing);

  const review = await Review.create({
    restaurantId: req.restaurantId,
    tableId: req.auth?.tableId,
    customerName: customerName.trim(),
    rating,
    comment: comment?.trim() || "",
    isApproved: false,
    source: "table",
    dupKey,
  });
  res.status(201).json(review);
});

/** What the public feedback page needs: the restaurant's name and logo, and where happy guests are sent. */
export const getPublicFeedbackInfo = asyncHandler(async (req: Request, res: Response) => {
  const restaurant = await Restaurant.findById(req.restaurantId).select("name nameStyle logoUrl googleReviewUrl googleMinStars");
  if (!restaurant) throw new HttpError(404, "Restaurant not found");
  res.json({
    name: restaurant.name,
    nameStyle: restaurant.nameStyle ?? [],
    logoUrl: restaurant.logoUrl ?? "",
    googleReviewUrl: restaurant.googleReviewUrl ?? "",
    googleMinStars: restaurant.googleMinStars ?? 4,
  });
});

// A feedback QR is public, so a person (or a script) gets a handful of submissions per hour.
const recentByIp = new Map<string, number[]>();
const MAX_PER_HOUR = 6;

export const submitPublicReview = asyncHandler(async (req: Request, res: Response) => {
  const { customerName, phone, rating, comment, website } = req.body as {
    customerName?: string;
    phone?: string;
    rating?: number;
    comment?: string;
    website?: string;
  };
  // A hidden field that only a bot fills in: pretend it worked.
  if (website) return res.status(201).json({ message: "Thank you for your feedback!" });

  if (!customerName?.trim()) throw new HttpError(400, "Please enter your name");
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new HttpError(400, "Please tap a star to rate your visit");
  }
  const text = (comment ?? "").trim().slice(0, 1000);

  const now = Date.now();
  const ip = req.ip ?? "unknown";
  const recent = (recentByIp.get(ip) ?? []).filter((t) => now - t < 60 * 60 * 1000);
  if (recent.length >= MAX_PER_HOUR) throw new HttpError(429, "You have sent feedback a few times already. Please try again later.");

  const restaurant = await Restaurant.findById(req.restaurantId).select("googleReviewUrl googleMinStars");
  const google =
    restaurant?.googleReviewUrl && rating >= (restaurant.googleMinStars ?? 4) ? restaurant.googleReviewUrl : null;

  const dupKey = feedbackKey(customerName, rating, text);
  const existing = await findRecentDuplicate(req.restaurantId!, dupKey);
  if (existing) return res.status(200).json({ message: "Thank you for your feedback!", duplicate: true, googleReviewUrl: google });

  recent.push(now);
  recentByIp.set(ip, recent);
  await Review.create({
    restaurantId: req.restaurantId,
    customerName: customerName.trim().slice(0, 80),
    phone: (phone ?? "").trim().slice(0, 20) || undefined,
    rating,
    comment: text,
    isApproved: false,
    source: "qr",
    dupKey,
  });
  res.status(201).json({ message: "Thank you for your feedback!", googleReviewUrl: google });
});

export const getFeedbackSettings = asyncHandler(async (req: Request, res: Response) => {
  const restaurant = await Restaurant.findById(req.restaurantId).select("googleReviewUrl googleMinStars feedbackQr");
  const saved = await GoogleReviewsConfig.findOne({ restaurantId: req.restaurantId });
  res.json({
    googleReviewUrl: restaurant?.googleReviewUrl ?? "",
    googleMinStars: restaurant?.googleMinStars ?? 4,
    googleFetchConfigured: await googleConfigured(req.restaurantId!),
    // The key itself is never sent back, only whether one is saved.
    hasSerpApiKey: !!saved?.apiKeyEnc || !!process.env.SERPAPI_API_KEY,
    googlePlaceId: saved?.placeId || process.env.GOOGLE_PLACE_ID || "",
    qr: { ...FEEDBACK_QR_DEFAULTS, ...(restaurant?.toObject().feedbackQr ?? {}) },
  });
});

export const updateFeedbackSettings = asyncHandler(async (req: Request, res: Response) => {
  const { googleReviewUrl, googleMinStars, qr, serpApiKey, googlePlaceId } = req.body as {
    googleReviewUrl?: unknown;
    googleMinStars?: unknown;
    qr?: Record<string, unknown>;
    serpApiKey?: unknown;
    googlePlaceId?: unknown;
  };

  // The key for fetching Google reviews: stored sealed, and left alone when the box is empty.
  const config: { apiKeyEnc?: string; placeId?: string } = {};
  if (typeof serpApiKey === "string" && serpApiKey.trim()) {
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(serpApiKey.trim())) throw new HttpError(400, "That does not look like a SerpApi key");
    config.apiKeyEnc = sealSecret(serpApiKey.trim());
  }
  if (googlePlaceId !== undefined) {
    const place = typeof googlePlaceId === "string" ? googlePlaceId.trim() : "";
    if (place && !/^(0x[0-9a-f]+:0x[0-9a-f]+|ChIJ[A-Za-z0-9_-]{10,})$/i.test(place)) {
      throw new HttpError(400, "Enter the Google place as a data ID (0x...:0x...) or a place ID (ChIJ...)");
    }
    config.placeId = place;
  }
  const set: Record<string, unknown> = {};
  if (googleReviewUrl !== undefined) {
    const url = typeof googleReviewUrl === "string" ? googleReviewUrl.trim() : "";
    if (url && !/^https:\/\/[^\s]+$/i.test(url)) throw new HttpError(400, "Enter the Google review link, starting with https://");
    set.googleReviewUrl = url;
  }
  if (googleMinStars !== undefined) {
    if (typeof googleMinStars !== "number" || !Number.isInteger(googleMinStars) || googleMinStars < 1 || googleMinStars > 5) {
      throw new HttpError(400, "Choose a star rating from 1 to 5");
    }
    set.googleMinStars = googleMinStars;
  }
  if (qr !== undefined) {
    if (typeof qr !== "object" || qr === null) throw new HttpError(400, "Invalid QR card settings");
    for (const key of ["showLogo", "showName", "showAddress"] as const) {
      if (qr[key] !== undefined) {
        if (typeof qr[key] !== "boolean") throw new HttpError(400, "Choose on or off for each QR card detail");
        set[`feedbackQr.${key}`] = qr[key];
      }
    }
    for (const [key, max] of [["heading", 40], ["instructionText", 80]] as const) {
      if (qr[key] !== undefined) {
        const text = typeof qr[key] === "string" ? (qr[key] as string).trim() : "";
        if (!text) throw new HttpError(400, "The text on the QR card can't be empty");
        set[`feedbackQr.${key}`] = text.slice(0, max);
      }
    }
    if (qr.accentColor !== undefined) {
      if (typeof qr.accentColor !== "string" || !/^#[0-9a-fA-F]{6}$/.test(qr.accentColor)) {
        throw new HttpError(400, "Choose the QR card colour from the colour picker");
      }
      set["feedbackQr.accentColor"] = qr.accentColor;
    }
  }
  if (Object.keys(set).length) await Restaurant.updateOne({ _id: req.restaurantId }, { $set: set });
  if (Object.keys(config).length) {
    await GoogleReviewsConfig.updateOne({ restaurantId: req.restaurantId }, { $set: config }, { upsert: true });
  }
  res.json({ message: "Saved" });
});

export const syncGoogle = asyncHandler(async (req: Request, res: Response) => {
  if (!(await googleConfigured(req.restaurantId!))) {
    throw new HttpError(400, "Google reviews are not set up yet: enter the SerpApi key and the Google place first.");
  }
  res.json(await syncGoogleReviews(req.restaurantId!));
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
