import { model, Schema, Types } from "mongoose";

export interface IOAuthAuthCode {
  _id: Types.ObjectId;
  code: string;
  adminId: Types.ObjectId;
  restaurantId: Types.ObjectId;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  used: boolean;
  expiresAt: Date;
  createdAt: Date;
}

const oauthAuthCodeSchema = new Schema<IOAuthAuthCode>(
  {
    code: { type: String, required: true, unique: true, index: true },
    adminId: { type: Schema.Types.ObjectId, ref: "Admin", required: true },
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
    clientId: { type: String, required: true, trim: true },
    redirectUri: { type: String, required: true, trim: true },
    codeChallenge: { type: String, required: true },
    codeChallengeMethod: { type: String, enum: ["S256"], default: "S256" },
    used: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default model<IOAuthAuthCode>("OAuthAuthCode", oauthAuthCodeSchema);
