import { Request, Response } from "express";

import { asyncHandler } from "../middleware/errorHandler";
import LandingContent from "../models/LandingContent";

export async function getOrCreateLandingContent(restaurantId: string) {
  const existing = await LandingContent.findOne({ restaurantId });
  if (existing) return existing;
  return LandingContent.create({ restaurantId });
}

export const getLandingContent = asyncHandler(async (req: Request, res: Response) => {
  res.json(await getOrCreateLandingContent(req.restaurantId!));
});

const SECTIONS = ["hero", "serve", "menu", "story", "outlets", "reels", "partnership", "footer"] as const;

export const updateLandingContent = asyncHandler(async (req: Request, res: Response) => {
  const doc = await getOrCreateLandingContent(req.restaurantId!);
  const body = (req.body ?? {}) as Record<string, unknown>;

  for (const key of SECTIONS) {
    if (body[key] !== undefined) {
      doc.set(key, body[key]);
    }
  }

  await doc.save();
  res.json(doc);
});
