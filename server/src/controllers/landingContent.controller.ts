import { Request, Response } from "express";

import { asyncHandler } from "../middleware/errorHandler";
import LandingContent from "../models/LandingContent";
import { HttpError } from "../utils/httpError";

export async function getOrCreateLandingContent(restaurantId: string) {
  const existing = await LandingContent.findOne({ restaurantId });
  if (existing) return existing;
  return LandingContent.create({ restaurantId });
}

export const getLandingContent = asyncHandler(async (req: Request, res: Response) => {
  res.json(await getOrCreateLandingContent(req.restaurantId!));
});

const SECTIONS = [
  "hero",
  "serve",
  "menu",
  "todaySpecial",
  "reviews",
  "menuCard",
  "nav",
  "story",
  "outlets",
  "reels",
  "partnership",
  "footer",
] as const;

export const updateLandingContent = asyncHandler(async (req: Request, res: Response) => {
  const doc = await getOrCreateLandingContent(req.restaurantId!);
  const body = (req.body ?? {}) as Record<string, unknown>;

  for (const key of SECTIONS) {
    if (body[key] !== undefined) {
      doc.set(key, body[key]);
    }
  }
  if (body.nav !== undefined) {
    // Links go to a place on this page, a page of this site, or another site: nothing that runs script.
    const links = ((body.nav as { items?: unknown[] })?.items ?? []) as { label?: unknown; href?: unknown; visible?: unknown }[];
    if (links.length > 12) throw new HttpError(400, "The menu can have up to 12 links");
    doc.nav.items.splice(0, doc.nav.items.length);
    for (const link of links) {
      const label = typeof link.label === "string" ? link.label.trim().slice(0, 30) : "";
      const href = typeof link.href === "string" ? link.href.trim() : "";
      if (!label) throw new HttpError(400, "Every menu link needs a name");
      if (!/^(#[A-Za-z0-9_-]+|\/[^\s]*|https?:\/\/[^\s]+)$/.test(href)) {
        throw new HttpError(400, `The link for "${label}" must start with #, / or https://`);
      }
      doc.nav.items.push({ label, href, visible: link.visible !== false });
    }
  }
  if (doc.reviews) {
    const n = Math.round(Number(doc.reviews.maxItems));
    doc.reviews.maxItems = Number.isFinite(n) ? Math.min(12, Math.max(1, n)) : 6;
  }

  await doc.save();
  res.json(doc);
});
