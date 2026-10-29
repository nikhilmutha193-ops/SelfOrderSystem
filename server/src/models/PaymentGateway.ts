import { model, Schema, Types } from "mongoose";

/**
 * The restaurant's online payment gateway account (Razorpay). Kept out of the Restaurant document
 * so the secrets never travel with GET /restaurant/settings, and out of backups (backupService)
 * so a backup file never holds them; after a restore the owner enters the keys again.
 * Secrets are encrypted with a key derived from JWT_SECRET (utils/secretBox.ts).
 */
export interface IPaymentGateway {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  provider: "razorpay";
  enabled: boolean;
  keyId: string;
  keySecretEnc: string;
  webhookSecretEnc: string;
  createdAt: Date;
  updatedAt: Date;
}

const paymentGatewaySchema = new Schema<IPaymentGateway>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, unique: true },
    provider: { type: String, enum: ["razorpay"], default: "razorpay" },
    enabled: { type: Boolean, default: false },
    keyId: { type: String, default: "", trim: true },
    keySecretEnc: { type: String, default: "" },
    webhookSecretEnc: { type: String, default: "" },
  },
  { timestamps: true }
);

export default model<IPaymentGateway>("PaymentGateway", paymentGatewaySchema);
