import { model, Schema, Types } from "mongoose";

export interface IStockCountLine {
  stockItemId: Types.ObjectId;
  name: string;
  unit: string;
  expected: number;
  counted: number;
  variance: number;
  value: number;
}

export interface IStockCount {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  countedAt: Date;
  note: string;
  lines: IStockCountLine[];
  varianceValue: number;
  byName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const stockCountSchema = new Schema<IStockCount>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
    countedAt: { type: Date, required: true },
    note: { type: String, trim: true, default: "" },
    lines: {
      type: [
        new Schema<IStockCountLine>(
          {
            stockItemId: { type: Schema.Types.ObjectId, ref: "StockItem", required: true },
            name: { type: String, required: true },
            unit: { type: String, required: true },
            expected: { type: Number, required: true },
            counted: { type: Number, required: true },
            variance: { type: Number, required: true },
            value: { type: Number, required: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    varianceValue: { type: Number, default: 0 },
    byName: { type: String },
  },
  { timestamps: true }
);

stockCountSchema.index({ restaurantId: 1, countedAt: -1 });

export default model<IStockCount>("StockCount", stockCountSchema);
