import { Request, Response } from "express";
import { Types } from "mongoose";

import { asyncHandler } from "../middleware/errorHandler";
import Coupon, { CouponType } from "../models/Coupon";
import { HttpError } from "../utils/httpError";

interface CouponBody {
  code?: string;
  type?: CouponType;
  value?: number;
  minOrderValue?: number;
  maxDiscountAmount?: number | null;
  usageLimit?: number | null;
  expiresAt?: string | null;
}

function validId(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(400, "Invalid id");
}

function validateCouponBody(body: CouponBody, requireCore: boolean) {
  if (requireCore || body.code !== undefined) {
    if (!body.code || !body.code.trim()) throw new HttpError(400, "code is required");
  }
  if (requireCore || body.type !== undefined) {
    if (body.type !== "percent" && body.type !== "flat") throw new HttpError(400, "type must be 'percent' or 'flat'");
  }
  if (requireCore || body.value !== undefined) {
    if (typeof body.value !== "number" || body.value <= 0) throw new HttpError(400, "value must be a positive number");
    if (body.type === "percent" && body.value > 100) throw new HttpError(400, "A percent discount cannot exceed 100");
  }
  if (body.minOrderValue !== undefined && (typeof body.minOrderValue !== "number" || body.minOrderValue < 0)) {
    throw new HttpError(400, "minOrderValue must be a non-negative number");
  }
  if (
    body.maxDiscountAmount !== undefined &&
    body.maxDiscountAmount !== null &&
    (typeof body.maxDiscountAmount !== "number" || body.maxDiscountAmount <= 0)
  ) {
    throw new HttpError(400, "maxDiscountAmount must be a positive number");
  }
  if (
    body.usageLimit !== undefined &&
    body.usageLimit !== null &&
    (typeof body.usageLimit !== "number" || body.usageLimit < 1)
  ) {
    throw new HttpError(400, "usageLimit must be at least 1");
  }
}

export const listCoupons = asyncHandler(async (req: Request, res: Response) => {
  const coupons = await Coupon.find({ restaurantId: req.restaurantId }).sort({ createdAt: -1 });
  res.json(coupons);
});

export const createCoupon = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CouponBody;
  validateCouponBody(body, true);

  const existing = await Coupon.findOne({ restaurantId: req.restaurantId, code: body.code!.trim().toUpperCase() });
  if (existing) throw new HttpError(409, "A coupon with this code already exists");

  const coupon = await Coupon.create({
    restaurantId: req.restaurantId,
    code: body.code!.trim().toUpperCase(),
    type: body.type,
    value: body.value,
    minOrderValue: body.minOrderValue ?? 0,
    maxDiscountAmount: body.maxDiscountAmount ?? undefined,
    usageLimit: body.usageLimit ?? undefined,
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    isActive: true,
  });
  res.status(201).json(coupon);
});

export const updateCoupon = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.id);
  const body = req.body as CouponBody;
  validateCouponBody(body, false);

  if (body.code !== undefined) {
    const normalized = body.code.trim().toUpperCase();
    const existing = await Coupon.findOne({
      restaurantId: req.restaurantId,
      code: normalized,
      _id: { $ne: req.params.id },
    });
    if (existing) throw new HttpError(409, "A coupon with this code already exists");
  }

  const set: Record<string, unknown> = {};
  const unset: Record<string, ""> = {};

  if (body.code !== undefined) set.code = body.code.trim().toUpperCase();
  if (body.type !== undefined) set.type = body.type;
  if (body.value !== undefined) set.value = body.value;
  if (body.minOrderValue !== undefined) set.minOrderValue = body.minOrderValue;

  if (body.maxDiscountAmount === null) unset.maxDiscountAmount = "";
  else if (body.maxDiscountAmount !== undefined) set.maxDiscountAmount = body.maxDiscountAmount;

  if (body.usageLimit === null) unset.usageLimit = "";
  else if (body.usageLimit !== undefined) set.usageLimit = body.usageLimit;

  if (body.expiresAt === null) unset.expiresAt = "";
  else if (body.expiresAt !== undefined) set.expiresAt = new Date(body.expiresAt);

  const update: Record<string, unknown> = {};
  if (Object.keys(set).length > 0) update.$set = set;
  if (Object.keys(unset).length > 0) update.$unset = unset;

  const coupon = await Coupon.findOneAndUpdate({ _id: req.params.id, restaurantId: req.restaurantId }, update, {
    new: true,
  });
  if (!coupon) throw new HttpError(404, "Coupon not found");
  res.json(coupon);
});

export const setCouponActive = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.id);
  const { isActive } = req.body as { isActive: boolean };
  const coupon = await Coupon.findOneAndUpdate(
    { _id: req.params.id, restaurantId: req.restaurantId },
    { $set: { isActive: !!isActive } },
    { new: true }
  );
  if (!coupon) throw new HttpError(404, "Coupon not found");
  res.json(coupon);
});

export const deleteCoupon = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.id);
  const result = await Coupon.findOneAndDelete({ _id: req.params.id, restaurantId: req.restaurantId });
  if (!result) throw new HttpError(404, "Coupon not found");
  res.status(204).send();
});
