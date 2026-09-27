import { model, Schema, Types } from "mongoose";

export interface IPrintAgent {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  name: string;
  tokenHash?: string;
  pairingCodeHash?: string;
  pairingExpiresAt?: Date | null;
  pairedAt?: Date | null;
  lastSeenAt?: Date | null;
  revokedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const printAgentSchema = new Schema<IPrintAgent>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    name: { type: String, required: true, trim: true },
    tokenHash: { type: String, index: true, sparse: true },
    pairingCodeHash: { type: String, index: true, sparse: true },
    pairingExpiresAt: { type: Date, default: null },
    pairedAt: { type: Date, default: null },
    lastSeenAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default model<IPrintAgent>("PrintAgent", printAgentSchema);
