import { Schema, model, Types } from "mongoose";

export interface IAdmin {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  username: string;
  passwordHash: string;
  securityQuestion: string;
  securityAnswerHash: string;
  createdAt: Date;
  updatedAt: Date;
}

const adminSchema = new Schema<IAdmin>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    username: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    securityQuestion: { type: String, required: true },
    securityAnswerHash: { type: String, required: true },
  },
  { timestamps: true }
);

adminSchema.index({ restaurantId: 1, username: 1 }, { unique: true });

export default model<IAdmin>("Admin", adminSchema);
