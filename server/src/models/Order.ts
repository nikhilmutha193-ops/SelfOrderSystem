import { Schema, model, Types } from "mongoose";

export type OrderType = "dine-in" | "delivery";
export type OrderStatus = "open" | "closed" | "cancelled";
export type PaymentMethod = "pending" | "cash" | "online" | "card";
export type DeliveryProvider = "Swiggy" | "Zomato" | "Uber-Eats" | "Other";

export interface IOrder {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  orderType: OrderType;
  tableId?: Types.ObjectId;
  deliveryProvider?: DeliveryProvider;
  customerName: string;
  customerPhone: string;
  members: number;
  checkinTime: Date;
  checkoutTime?: Date;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  couponCode?: string;
  discountAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

const orderSchema = new Schema<IOrder>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    orderType: { type: String, enum: ["dine-in", "delivery"], required: true },
    tableId: { type: Schema.Types.ObjectId, ref: "Table" },
    deliveryProvider: { type: String, enum: ["Swiggy", "Zomato", "Uber-Eats", "Other"] },
    customerName: { type: String, required: true, trim: true },
    customerPhone: { type: String, required: true, trim: true },
    members: { type: Number, default: 1, min: 1 },
    checkinTime: { type: Date, default: Date.now },
    checkoutTime: { type: Date },
    status: { type: String, enum: ["open", "closed", "cancelled"], default: "open", index: true },
    paymentMethod: { type: String, enum: ["pending", "cash", "online", "card"], default: "pending" },
    couponCode: { type: String, trim: true, uppercase: true },
    discountAmount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

export default model<IOrder>("Order", orderSchema);
