import { model, Schema, Types } from "mongoose";

/**
 * One online checkout for an order. "created" until the gateway confirms a payment, then:
 * "paid" (the order was settled with it), "mismatch" (paid, but the bill changed after checkout
 * started, so staff must settle it), or "duplicate" (paid, but the order was already paid,
 * so it needs a refund from the gateway dashboard).
 */
export type PaymentAttemptStatus = "created" | "processing" | "paid" | "mismatch" | "duplicate";

export interface IPaymentAttempt {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  orderId: Types.ObjectId;
  provider: "razorpay";
  gatewayOrderId: string;
  /** In paise, as the gateway counts it. */
  amount: number;
  currency: "INR";
  status: PaymentAttemptStatus;
  paymentId?: string;
  method?: string;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const paymentAttemptSchema = new Schema<IPaymentAttempt>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    provider: { type: String, enum: ["razorpay"], default: "razorpay" },
    gatewayOrderId: { type: String, required: true, unique: true },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, enum: ["INR"], default: "INR" },
    status: {
      type: String,
      enum: ["created", "processing", "paid", "mismatch", "duplicate"],
      default: "created",
    },
    paymentId: { type: String },
    method: { type: String },
    note: { type: String },
  },
  { timestamps: true }
);

paymentAttemptSchema.index({ restaurantId: 1, orderId: 1, createdAt: -1 });
paymentAttemptSchema.index({ restaurantId: 1, status: 1 });

export default model<IPaymentAttempt>("PaymentAttempt", paymentAttemptSchema);
