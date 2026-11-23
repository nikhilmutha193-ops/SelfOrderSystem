import { model, Schema, Types } from "mongoose";

/**
 * The restaurant's online payment gateway account (Razorpay). Kept out of the Restaurant document
 * so the secrets never travel with GET /restaurant/settings, and out of backups (backupService)
 * so a backup file never holds them; after a restore the owner enters the keys again.
 * Secrets are encrypted with a key derived from JWT_SECRET (utils/secretBox.ts).
 */
export type GatewayProvider = "razorpay" | "paytm";

export interface IPaymentGateway {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  /** Which account takes the online payments. Both can be saved; only this one is used. */
  provider: GatewayProvider;
  enabled: boolean;
  keyId: string;
  keySecretEnc: string;
  webhookSecretEnc: string;
  /** Paytm Payment Gateway: Merchant ID, the encrypted Merchant Key, website name and staging or production. */
  paytmMid: string;
  paytmKeyEnc: string;
  paytmWebsite: string;
  paytmEnvironment: "staging" | "production";
  createdAt: Date;
  updatedAt: Date;
}

const paymentGatewaySchema = new Schema<IPaymentGateway>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, unique: true },
    provider: { type: String, enum: ["razorpay", "paytm"], default: "razorpay" },
    enabled: { type: Boolean, default: false },
    keyId: { type: String, default: "", trim: true },
    keySecretEnc: { type: String, default: "" },
    webhookSecretEnc: { type: String, default: "" },
    paytmMid: { type: String, default: "", trim: true },
    paytmKeyEnc: { type: String, default: "" },
    paytmWebsite: { type: String, default: "DEFAULT", trim: true },
    paytmEnvironment: { type: String, enum: ["staging", "production"], default: "production" },
  },
  { timestamps: true }
);

export default model<IPaymentGateway>("PaymentGateway", paymentGatewaySchema);
