import { model, Schema, Types } from "mongoose";

/**
 * What a stock item is counted in (stock on hand, recipes and wastage all use it). Weight, volume and counts; the
 * purchase unit ("kg", "L", "tray"...) is only how it is bought and is separate. Keep in step with client/src/lib/types.ts.
 */
export const STOCK_UNITS = ["g", "kg", "ml", "l", "pcs", "dozen", "packet", "box", "bottle", "can", "tray", "bunch"] as const;
export type StockUnit = (typeof STOCK_UNITS)[number];

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
    unit: { type: String, enum: STOCK_UNITS, required: true },
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
