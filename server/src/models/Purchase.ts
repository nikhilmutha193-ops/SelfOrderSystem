import { model, Schema, Types } from "mongoose";

export interface IPurchaseLine {
  stockItemId: Types.ObjectId;
  name: string;
  quantity: number;
  purchaseUnit: string;
  unitPrice: number;
  amount: number;
}

export interface IPurchase {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  vendorId?: Types.ObjectId | null;
  vendorName: string;
  invoiceRef: string;
  purchasedAt: Date;
  lines: IPurchaseLine[];
  total: number;
  byName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const purchaseSchema = new Schema<IPurchase>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor", default: null },
    vendorName: { type: String, default: "" },
    invoiceRef: { type: String, trim: true, default: "" },
    purchasedAt: { type: Date, required: true },
    lines: {
      type: [
        new Schema<IPurchaseLine>(
          {
            stockItemId: { type: Schema.Types.ObjectId, ref: "StockItem", required: true },
            name: { type: String, required: true },
            quantity: { type: Number, required: true },
            purchaseUnit: { type: String, default: "" },
            unitPrice: { type: Number, required: true },
            amount: { type: Number, required: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    total: { type: Number, required: true },
    byName: { type: String },
  },
  { timestamps: true }
);

purchaseSchema.index({ restaurantId: 1, purchasedAt: -1 });

export default model<IPurchase>("Purchase", purchaseSchema);
