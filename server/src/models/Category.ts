import { Schema, model, Types } from "mongoose";

export interface ICategory {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  name: string;
  description?: string;
  /** Per-language overrides, keyed by language code (e.g. "kn", "hi"): { name?, description? }. */
  translations?: Record<string, { name?: string; description?: string }>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<ICategory>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    translations: { type: Schema.Types.Mixed, default: {} },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default model<ICategory>("Category", categorySchema);
