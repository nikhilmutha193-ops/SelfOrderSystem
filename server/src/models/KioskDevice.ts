import { model, Schema, Types } from "mongoose";

/**
 * A self-order kiosk screen, paired once with a one-time code like a print agent (only hashes are
 * stored). It then calls /api/kiosk with "Authorization: Kiosk <token>". Not in backups: a restored
 * database should not bring old devices back, so kiosks are paired again.
 */
export interface IKioskDevice {
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

const kioskDeviceSchema = new Schema<IKioskDevice>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    tokenHash: { type: String, index: true, sparse: true },
    pairingCodeHash: { type: String, index: true, sparse: true },
    pairingExpiresAt: { type: Date, default: null },
    pairedAt: { type: Date, default: null },
    lastSeenAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default model<IKioskDevice>("KioskDevice", kioskDeviceSchema);
