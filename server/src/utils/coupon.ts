import Coupon, { ICoupon } from "../models/Coupon";
import CouponRedemption from "../models/CouponRedemption";
import { HttpError } from "./httpError";
import { normalizePhone } from "./phone";

export async function findValidCoupon(
  restaurantId: string,
  code: string,
  subtotal: number,
  customerPhone?: string
): Promise<ICoupon> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) throw new HttpError(400, "A coupon code is required");

  const coupon = await Coupon.findOne({ restaurantId, code: normalized });
  if (!coupon) throw new HttpError(404, "Invalid coupon code");
  if (!coupon.isActive) throw new HttpError(400, "This coupon is no longer active");
  if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) {
    throw new HttpError(400, "This coupon has expired");
  }
  if (coupon.usageLimit !== undefined && coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    throw new HttpError(400, "This coupon has reached its usage limit");
  }
  if (subtotal < coupon.minOrderValue) {
    throw new HttpError(400, `This coupon requires a minimum order of ${coupon.minOrderValue.toFixed(2)}`);
  }
  const phone = normalizePhone(customerPhone);
  if (!phone) {
    throw new HttpError(400, "Add a mobile number to this order before applying this coupon");
  }
  if (coupon.perCustomerLimit !== undefined && coupon.perCustomerLimit !== null) {
    const used = await CouponRedemption.countDocuments({ restaurantId, couponId: coupon._id, phone });
    if (used >= coupon.perCustomerLimit) {
      throw new HttpError(400, "This mobile number has already used this coupon the maximum number of times");
    }
  }
  return coupon;
}

export function computeDiscountAmount(coupon: ICoupon, subtotal: number): number {
  let discount = coupon.type === "percent" ? (subtotal * coupon.value) / 100 : coupon.value;
  if (coupon.maxDiscountAmount !== undefined && coupon.maxDiscountAmount !== null) {
    discount = Math.min(discount, coupon.maxDiscountAmount);
  }
  discount = Math.min(discount, subtotal);
  return Math.round(discount * 100) / 100;
}
