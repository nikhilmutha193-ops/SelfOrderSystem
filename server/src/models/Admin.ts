import { model, Schema, Types } from "mongoose";

import { PermissionLevel } from "../utils/permissions";

export interface IAdmin {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  username: string;
  passwordHash: string;
  securityQuestion: string;
  securityAnswerHash: string;
  isOwner: boolean;
  permissions: Map<string, PermissionLevel>;
  tokenVersion: number;
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
    isOwner: { type: Boolean, default: false },
    tokenVersion: { type: Number, default: 0 },
    permissions: {
      type: Map,
      of: { type: String, enum: ["view", "edit"] },
      default: () => ({}),
    },
  },
  { timestamps: true }
);

adminSchema.index({ restaurantId: 1, username: 1 }, { unique: true });

export default model<IAdmin>("Admin", adminSchema);
