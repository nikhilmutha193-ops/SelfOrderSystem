import { Request, Response } from "express";
import { Types } from "mongoose";

import { asyncHandler } from "../middleware/errorHandler";
import PromoBanner from "../models/PromoBanner";
import { HttpError } from "../utils/httpError";

function validId(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(400, "Invalid id");
}

export const listPromoBanners = asyncHandler(async (req: Request, res: Response) => {
  const banners = await PromoBanner.find({ restaurantId: req.restaurantId }).sort({ sortOrder: 1, createdAt: 1 });
  res.json(banners);
});

export const createPromoBanner = asyncHandler(async (req: Request, res: Response) => {
  const { title, desktopImageUrl, mobileImageUrl, linkUrl, sortOrder } = req.body as {
    title?: string;
    desktopImageUrl?: string;
    mobileImageUrl?: string;
    linkUrl?: string;
    sortOrder?: number;
  };
  if (!desktopImageUrl) throw new HttpError(400, "desktopImageUrl is required");

  const banner = await PromoBanner.create({
    restaurantId: req.restaurantId,
    title,
    desktopImageUrl,
    mobileImageUrl,
    linkUrl,
    sortOrder: sortOrder ?? 0,
    isActive: true,
  });
  res.status(201).json(banner);
});

export const updatePromoBanner = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.id);
  const { title, desktopImageUrl, mobileImageUrl, linkUrl, sortOrder } = req.body as {
    title?: string;
    desktopImageUrl?: string;
    mobileImageUrl?: string;
    linkUrl?: string;
    sortOrder?: number;
  };

  const banner = await PromoBanner.findOneAndUpdate(
    { _id: req.params.id, restaurantId: req.restaurantId },
    {
      $set: {
        ...(title !== undefined && { title }),
        ...(desktopImageUrl !== undefined && { desktopImageUrl }),
        ...(mobileImageUrl !== undefined && { mobileImageUrl }),
        ...(linkUrl !== undefined && { linkUrl }),
        ...(sortOrder !== undefined && { sortOrder }),
      },
    },
    { new: true }
  );
  if (!banner) throw new HttpError(404, "Banner not found");
  res.json(banner);
});

export const setPromoBannerActive = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.id);
  const { isActive } = req.body as { isActive: boolean };
  const banner = await PromoBanner.findOneAndUpdate(
    { _id: req.params.id, restaurantId: req.restaurantId },
    { $set: { isActive: !!isActive } },
    { new: true }
  );
  if (!banner) throw new HttpError(404, "Banner not found");
  res.json(banner);
});

export const deletePromoBanner = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.id);
  const result = await PromoBanner.findOneAndDelete({ _id: req.params.id, restaurantId: req.restaurantId });
  if (!result) throw new HttpError(404, "Banner not found");
  res.status(204).send();
});
