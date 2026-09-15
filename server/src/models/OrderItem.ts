import { Schema, model, Types } from "mongoose";

export type OrderItemStatus = "pending" | "preparing" | "ready" | "served" | "cancelled";

export interface IOrderItem {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  orderId: Types.ObjectId;
  foodItemId: Types.ObjectId;
  foodName: string;
  unitPrice: number;
  quantity: number;
  total: number;
  isJain: boolean;
  status: OrderItemStatus;
  kotRound: number | null;
  /** Token number for the business day the ticket was printed on. */
  tokenNumber: number | null;
  kotPrintedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<IOrderItem>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    foodItemId: { type: Schema.Types.ObjectId, ref: "FoodItem", required: true },
    foodName: { type: String, required: true },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    total: { type: Number, required: true, min: 0 },
    isJain: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["pending", "preparing", "ready", "served", "cancelled"],
      default: "pending",
      index: true,
    },
    kotRound: { type: Number, default: null },
    tokenNumber: { type: Number, default: null },
    kotPrintedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default model<IOrderItem>("OrderItem", orderItemSchema);
