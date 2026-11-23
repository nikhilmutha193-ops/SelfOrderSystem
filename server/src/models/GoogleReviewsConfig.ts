import { model, Schema, Types } from "mongoose";

/**
 * How this restaurant's Google reviews are fetched: the SerpApi key (encrypted with a key derived from JWT_SECRET, see
 * utils/secretBox.ts) and which Google place to read. Kept out of the Restaurant document and out of backups, like the
 * payment gateway keys, so a backup file never holds the secret; after a restore the owner enters it again.
 */
export interface IGoogleReviewsConfig {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  apiKeyEnc: string;
  /** The Google Maps data ID (0x...:0x...) or place ID (ChIJ...) of the restaurant. */
  placeId: string;
  createdAt: Date;
  updatedAt: Date;
}

const googleReviewsConfigSchema = new Schema<IGoogleReviewsConfig>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, unique: true },
    apiKeyEnc: { type: String, default: "" },
    placeId: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

export default model<IGoogleReviewsConfig>("GoogleReviewsConfig", googleReviewsConfigSchema);
