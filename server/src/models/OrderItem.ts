import { model, Schema, Types } from "mongoose";

export type OrderItemStatus = "pending" | "preparing" | "ready" | "served" | "cancelled";

export interface IOrderItem {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  orderId: Types.ObjectId;
  foodItemId?: Types.ObjectId;
  foodName: string;
  unitPrice: number;
  quantity: number;
  total: number;
  isJain: boolean;
  modifiers: { groupName: string; label: string; priceDelta: number }[];
  note: string;
  status: OrderItemStatus;
  kotRound: number | null;
  tokenNumber: number | null;
  kotPrintedAt: Date | null;
  readyAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<IOrderItem>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    foodItemId: { type: Schema.Types.ObjectId, ref: "FoodItem" },
    foodName: { type: String, required: true },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    total: { type: Number, required: true, min: 0 },
    isJain: { type: Boolean, default: false },
    modifiers: {
      type: [new Schema({ groupName: String, label: String, priceDelta: Number }, { _id: false })],
      default: [],
    },
    note: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "preparing", "ready", "served", "cancelled"],
      default: "pending",
      index: true,
    },
    kotRound: { type: Number, default: null },
    tokenNumber: { type: Number, default: null },
    kotPrintedAt: { type: Date, default: null },
    readyAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default model<IOrderItem>("OrderItem", orderItemSchema);
