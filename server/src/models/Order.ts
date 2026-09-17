import { Schema, model, Types } from "mongoose";

/** "delivery" is retained for orders placed before take-away replaced it. */
export type OrderType = "dine-in" | "takeaway" | "delivery";
export type OrderStatus = "open" | "closed" | "cancelled";
/** Who raised the order. Counter orders are staff-owned and are never auto-cancelled. */
export type OrderSource = "guest" | "counter";
export type PaymentMethod = "pending" | "cash" | "online" | "card";
export type DeliveryProvider = "Swiggy" | "Zomato" | "Uber-Eats" | "Other";

export interface IOrder {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  orderType: OrderType;
  tableId?: Types.ObjectId;
  deliveryProvider?: DeliveryProvider;
  customerName: string;
  /** Optional - guests can skip it. */
  customerPhone?: string;
  members: number;
  checkinTime: Date;
  checkoutTime?: Date;
  status: OrderStatus;
  source: OrderSource;
  paymentMethod: PaymentMethod;
  couponCode?: string;
  discountAmount: number;
  /** When the kitchen should have everything ready. Pushed later as rounds are added. */
  estimatedReadyAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const orderSchema = new Schema<IOrder>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    orderType: { type: String, enum: ["dine-in", "takeaway", "delivery"], required: true },
    tableId: { type: Schema.Types.ObjectId, ref: "Table" },
    deliveryProvider: { type: String, enum: ["Swiggy", "Zomato", "Uber-Eats", "Other"] },
    customerName: { type: String, required: true, trim: true },
    customerPhone: { type: String, default: "", trim: true },
    members: { type: Number, default: 1, min: 1 },
    checkinTime: { type: Date, default: Date.now },
    checkoutTime: { type: Date },
    status: { type: String, enum: ["open", "closed", "cancelled"], default: "open", index: true },
    source: { type: String, enum: ["guest", "counter"], default: "guest" },
    paymentMethod: { type: String, enum: ["pending", "cash", "online", "card"], default: "pending" },
    couponCode: { type: String, trim: true, uppercase: true },
    discountAmount: { type: Number, default: 0, min: 0 },
    estimatedReadyAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default model<IOrder>("Order", orderSchema);
