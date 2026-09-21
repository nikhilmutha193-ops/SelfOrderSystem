import { Schema, model, Types } from "mongoose";

export type OrderItemStatus = "pending" | "preparing" | "ready" | "served" | "cancelled";

export interface IOrderItem {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  orderId: Types.ObjectId;
  /** Absent for aggregator (Swiggy/Zomato) lines that don't map to a local menu item. */
  foodItemId?: Types.ObjectId;
  foodName: string;
  unitPrice: number;
  quantity: number;
  total: number;
  isJain: boolean;
  /** Chosen customizations, e.g. [{ groupName:"Size", label:"Large", priceDelta:40 }]. */
  modifiers: { groupName: string; label: string; priceDelta: number }[];
  /** Free-text kitchen note, e.g. "no onions". */
  note: string;
  status: OrderItemStatus;
  kotRound: number | null;
  /** Token number for the business day the ticket was printed on. */
  tokenNumber: number | null;
  kotPrintedAt: Date | null;
  /** When the kitchen marked it ready; with kotPrintedAt gives the actual prep time. */
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
