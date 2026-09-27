import { model, Schema, Types } from "mongoose";

export interface ICategory {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  name: string;
  description?: string;
  translations?: Record<string, { name?: string; description?: string }>;
  isActive: boolean;
  defaultStationId?: Types.ObjectId | null;
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
    defaultStationId: { type: Schema.Types.ObjectId, ref: "Station", default: null },
  },
  { timestamps: true }
);

export default model<ICategory>("Category", categorySchema);
