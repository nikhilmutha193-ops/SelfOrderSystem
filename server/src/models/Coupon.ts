import { model, Schema, Types } from "mongoose";

export type CouponType = "percent" | "flat";

export interface ICoupon {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  code: string;
  type: CouponType;
  value: number;
  minOrderValue: number;
  maxDiscountAmount?: number;
  usageLimit?: number;
  usedCount: number;
  /** Max times one mobile number may use this coupon. Unset means no per-customer cap - only
   *  usageLimit (the overall cap) applies. Every coupon already requires a phone number on the
   *  order to apply at all (see findValidCoupon), which this limit checks against. */
  perCustomerLimit?: number;
  expiresAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const couponSchema = new Schema<ICoupon>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    type: { type: String, enum: ["percent", "flat"], required: true },
    value: { type: Number, required: true, min: 0 },
    minOrderValue: { type: Number, default: 0, min: 0 },
    maxDiscountAmount: { type: Number, min: 0 },
    usageLimit: { type: Number, min: 1 },
    usedCount: { type: Number, default: 0 },
    perCustomerLimit: { type: Number, min: 1 },
    expiresAt: { type: Date },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

couponSchema.index({ restaurantId: 1, code: 1 }, { unique: true });

export default model<ICoupon>("Coupon", couponSchema);
