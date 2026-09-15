import { Schema, model, Types } from "mongoose";

export interface IChef {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  username: string;
  passwordHash: string;
  password: string;
  createdAt: Date;
  updatedAt: Date;
}

const chefSchema = new Schema<IChef>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    username: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    password: { type: String, required: true },
  },
  { timestamps: true }
);

chefSchema.index({ restaurantId: 1, username: 1 }, { unique: true });

export default model<IChef>("Chef", chefSchema);
