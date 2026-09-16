import { Request, Response } from "express";
import LandingContent from "../models/LandingContent";
import { asyncHandler } from "../middleware/errorHandler";

/** Creates the document on first read so the editor always has something to load. */
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

  // Sections are replaced wholesale, but only the ones actually sent - so saving
  // one panel in the editor can't blank out the others.
  for (const key of SECTIONS) {
    if (body[key] !== undefined) {
      doc.set(key, body[key]);
    }
  }

  await doc.save();
  res.json(doc);
});
