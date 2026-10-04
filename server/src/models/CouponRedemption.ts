import { model, Schema, Types } from "mongoose";

/**
 * One row per order that actually used a coupon with a phone number on it - lets
 * findValidCoupon() count how many times a given mobile number has used a coupon, to enforce
 * Coupon.perCustomerLimit. Written at billing time (see orders.billing.ts's billOpenOrder) and
 * removed again if that bill is reopened, cancelled or voided, mirroring Coupon.usedCount.
 */
export interface ICouponRedemption {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  couponId: Types.ObjectId;
  phone: string;
  orderId: Types.ObjectId;
  createdAt: Date;
}

const couponRedemptionSchema = new Schema<ICouponRedemption>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    couponId: { type: Schema.Types.ObjectId, ref: "Coupon", required: true },
    phone: { type: String, required: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Powers the per-customer-limit count check.
couponRedemptionSchema.index({ restaurantId: 1, couponId: 1, phone: 1 });
// One order can only ever redeem one coupon (Order.couponCode is a single field), and release
// logic deletes by orderId alone - keeps that lookup unique and this collection self-consistent.
couponRedemptionSchema.index({ restaurantId: 1, orderId: 1 }, { unique: true });

export default model<ICouponRedemption>("CouponRedemption", couponRedemptionSchema);
