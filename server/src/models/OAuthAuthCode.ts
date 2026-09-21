import { Schema, model, Types } from "mongoose";

/**
 * A short-lived OAuth 2.1 authorization code (Authorization Code + PKCE flow), used to let
 * an MCP client (or any external OAuth client) obtain an access token scoped to one admin's
 * existing permissions. Stored in Mongo (not memory) so the flow works across serverless
 * invocations; the TTL index auto-deletes expired/unused codes.
 */
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
    // TTL index: Mongo removes the document once expiresAt passes - codes are single-use
    // and short-lived (a few minutes), so nothing needs to survive longer than that.
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default model<IOAuthAuthCode>("OAuthAuthCode", oauthAuthCodeSchema);
