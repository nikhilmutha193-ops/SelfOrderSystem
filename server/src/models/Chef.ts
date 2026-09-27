import { model, Schema, Types } from "mongoose";

export interface IChef {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  username: string;
  passwordHash: string;
  password: string;
  tokenVersion: number;
  stationId?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const chefSchema = new Schema<IChef>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    username: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    password: { type: String, required: true },
    tokenVersion: { type: Number, default: 0 },
    stationId: { type: Schema.Types.ObjectId, ref: "Station", default: null },
  },
  { timestamps: true }
);

chefSchema.index({ restaurantId: 1, username: 1 }, { unique: true });

export default model<IChef>("Chef", chefSchema);
