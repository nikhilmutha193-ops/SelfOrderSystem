import { model, Schema, Types } from "mongoose";

export type StockUnit = "g" | "ml" | "pcs";

export interface IStockItem {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  name: string;
  unit: StockUnit;
  purchaseUnit: string;
  purchaseFactor: number;
  reorderLevel: number;
  avgCost: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const stockItemSchema = new Schema<IStockItem>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    name: { type: String, required: true, trim: true },
    unit: { type: String, enum: ["g", "ml", "pcs"], required: true },
    purchaseUnit: { type: String, trim: true, default: "" },
    purchaseFactor: { type: Number, default: 1, min: 1 },
    reorderLevel: { type: Number, default: 0, min: 0 },
    avgCost: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

stockItemSchema.index({ restaurantId: 1, name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });

export default model<IStockItem>("StockItem", stockItemSchema);
