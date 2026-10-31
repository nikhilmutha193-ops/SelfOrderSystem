import { model, Schema, Types } from "mongoose";

import { TENDER_METHODS, TenderMethod } from "./Order";

export const REFUND_REASONS = [
  "customer_cancelled",
  "changed_item",
  "wrong_item",
  "quality_issue",
  "item_unavailable",
  "other",
] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

export const REFUND_REASON_LABELS: Record<RefundReason, string> = {
  customer_cancelled: "Customer cancelled",
  changed_item: "Customer changed the item",
  wrong_item: "Wrong item served",
  quality_issue: "Quality issue",
  item_unavailable: "Item unavailable",
  other: "Other",
};

/** Money returned to a guest for a paid order: items they no longer want, or an amount agreed at the till. */
export interface IRefund {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  orderId: Types.ObjectId;
  invoiceNumber?: string;
  customerName: string;
  amount: number;
  /** How the money went back. "Pay later" is not a refund method. */
  method: TenderMethod;
  reason: RefundReason;
  note?: string;
  kind: "items" | "amount";
  items: { itemId: Types.ObjectId; foodName: string; quantity: number; amount: number }[];
  createdBy: string;
  createdByName: string;
  createdAt: Date;
}

const refundSchema = new Schema<IRefund>({
  restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
  orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
  invoiceNumber: { type: String },
  customerName: { type: String, default: "" },
  amount: { type: Number, required: true, min: 0.01 },
  method: { type: String, enum: TENDER_METHODS, required: true },
  reason: { type: String, enum: REFUND_REASONS, required: true },
  note: { type: String, trim: true, maxlength: 200 },
  kind: { type: String, enum: ["items", "amount"], required: true },
  items: {
    type: [
      new Schema(
        {
          itemId: { type: Schema.Types.ObjectId, ref: "OrderItem", required: true },
          foodName: { type: String, required: true },
          quantity: { type: Number, required: true },
          amount: { type: Number, required: true },
        },
        { _id: false }
      ),
    ],
    default: [],
  },
  createdBy: { type: String, required: true },
  createdByName: { type: String, default: "" },
  createdAt: { type: Date, default: () => new Date() },
});

refundSchema.index({ restaurantId: 1, createdAt: -1 });
refundSchema.index({ restaurantId: 1, orderId: 1 });

export default model<IRefund>("Refund", refundSchema);
