import { model, Schema, Types } from "mongoose";

export interface IVendor {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  name: string;
  phone: string;
  gstin: string;
  createdAt: Date;
  updatedAt: Date;
}

const vendorSchema = new Schema<IVendor>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true, default: "" },
    gstin: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

vendorSchema.index({ restaurantId: 1, name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });

export default model<IVendor>("Vendor", vendorSchema);
