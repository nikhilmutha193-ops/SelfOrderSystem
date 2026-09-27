import { model, Schema, Types } from "mongoose";

export interface IStation {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

const stationSchema = new Schema<IStation>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

stationSchema.index({ restaurantId: 1, name: 1 }, { unique: true });

export default model<IStation>("Station", stationSchema);
