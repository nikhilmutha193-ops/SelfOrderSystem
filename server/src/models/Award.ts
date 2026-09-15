import { Schema, model, Types } from "mongoose";

export interface IAward {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  title: string;
  issuer?: string;
  year?: number;
  imageUrl?: string;
  description?: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const awardSchema = new Schema<IAward>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    title: { type: String, required: true, trim: true },
    issuer: { type: String, default: "" },
    year: { type: Number },
    imageUrl: { type: String, default: "" },
    description: { type: String, default: "" },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default model<IAward>("Award", awardSchema);
