import { model, Schema, Types } from "mongoose";

export type CreditEntryType = "charge" | "payment" | "reverse";
export type CreditPaymentMethod = "cash" | "upi" | "card" | "online";

export interface ICreditEntry {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  customerId: Types.ObjectId;
  type: CreditEntryType;
  amount: number;
  orderId?: Types.ObjectId | null;
  invoiceNumber?: string;
  method?: CreditPaymentMethod;
  reference?: string;
  note?: string;
  by?: Types.ObjectId | null;
  byName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const creditEntrySchema = new Schema<ICreditEntry>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    type: { type: String, enum: ["charge", "payment", "reverse"], required: true },
    amount: { type: Number, required: true, min: 0 },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", default: null },
    invoiceNumber: { type: String },
    method: { type: String, enum: ["cash", "upi", "card", "online"] },
    reference: { type: String, trim: true },
    note: { type: String, trim: true },
    by: { type: Schema.Types.ObjectId, ref: "Admin", default: null },
    byName: { type: String },
  },
  { timestamps: true }
);

creditEntrySchema.index({ restaurantId: 1, customerId: 1, createdAt: 1 });
creditEntrySchema.index(
  { orderId: 1, type: 1 },
  { unique: true, partialFilterExpression: { type: { $in: ["charge", "reverse"] } } }
);

export default model<ICreditEntry>("CreditEntry", creditEntrySchema);
