import { Schema, model, Types } from "mongoose";
import { PermissionLevel } from "../utils/permissions";

export interface IAdmin {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  username: string;
  passwordHash: string;
  securityQuestion: string;
  securityAnswerHash: string;
  /** The restaurant's original account: always has every module and can't be locked out. */
  isOwner: boolean;
  /** Module key -> level. A missing key means no access to that module. */
  permissions: Map<string, PermissionLevel>;
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
