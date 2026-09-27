import { model, Schema, Types } from "mongoose";

export type LoyaltyEntryType = "earn" | "redeem" | "reverse" | "expire" | "adjust";

export interface ILoyaltyEntry {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  customerId: Types.ObjectId;
  type: LoyaltyEntryType;
  points: number;
  orderId?: Types.ObjectId | null;
  expiresAt?: Date | null;
  note?: string;
  createdAt: Date;
}

const loyaltyEntrySchema = new Schema<ILoyaltyEntry>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    type: { type: String, enum: ["earn", "redeem", "reverse", "expire", "adjust"], required: true },
    points: { type: Number, required: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", default: null },
    expiresAt: { type: Date, default: null },
    note: { type: String, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

loyaltyEntrySchema.index({ restaurantId: 1, customerId: 1, createdAt: -1 });
loyaltyEntrySchema.index({ restaurantId: 1, orderId: 1 });

export default model<ILoyaltyEntry>("LoyaltyEntry", loyaltyEntrySchema);
