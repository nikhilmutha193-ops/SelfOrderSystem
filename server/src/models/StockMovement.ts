import { model, Schema, Types } from "mongoose";

export type StockMovementType = "opening" | "purchase" | "consumption" | "reversal" | "wastage" | "adjustment";

export interface IStockMovement {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  stockItemId: Types.ObjectId;
  type: StockMovementType;
  quantity: number;
  unitCost: number;
  orderId?: Types.ObjectId | null;
  orderItemId?: Types.ObjectId | null;
  purchaseId?: Types.ObjectId | null;
  countId?: Types.ObjectId | null;
  note?: string;
  byName?: string;
  createdAt: Date;
}

const stockMovementSchema = new Schema<IStockMovement>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
    stockItemId: { type: Schema.Types.ObjectId, ref: "StockItem", required: true },
    type: {
      type: String,
      enum: ["opening", "purchase", "consumption", "reversal", "wastage", "adjustment"],
      required: true,
    },
    quantity: { type: Number, required: true },
    unitCost: { type: Number, default: 0 },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", default: null },
    orderItemId: { type: Schema.Types.ObjectId, ref: "OrderItem", default: null },
    purchaseId: { type: Schema.Types.ObjectId, ref: "Purchase", default: null },
    countId: { type: Schema.Types.ObjectId, ref: "StockCount", default: null },
    note: { type: String, trim: true },
    byName: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

stockMovementSchema.index({ restaurantId: 1, stockItemId: 1, createdAt: 1 });
stockMovementSchema.index({ restaurantId: 1, createdAt: 1 });
stockMovementSchema.index(
  { restaurantId: 1, orderItemId: 1 },
  { partialFilterExpression: { orderItemId: { $type: "objectId" } } }
);

export default model<IStockMovement>("StockMovement", stockMovementSchema);
