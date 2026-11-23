import { model, Schema, Types } from "mongoose";

/** Where a review came from: a table guest, the public feedback QR, or Google. */
export type ReviewSource = "table" | "qr" | "google";

export interface IReview {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  tableId?: Types.ObjectId;
  customerName: string;
  phone?: string;
  rating: number;
  comment: string;
  /** Shown on the website. Hiding a review is switching this off; nothing is deleted. */
  isApproved: boolean;
  source: ReviewSource;
  /** Hash of the Google review (author, rating, text) so fetching again never adds it twice. */
  googleKey?: string;
  /** Hash of name, rating and comment, to drop the same feedback sent twice in a day. */
  dupKey?: string;
  relativeDate?: string;
  profilePhotoUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const reviewSchema = new Schema<IReview>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    tableId: { type: Schema.Types.ObjectId, ref: "Table" },
    customerName: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: "", trim: true },
    isApproved: { type: Boolean, default: false },
    source: { type: String, enum: ["table", "qr", "google"], default: "table" },
    googleKey: { type: String },
    dupKey: { type: String },
    relativeDate: { type: String },
    profilePhotoUrl: { type: String },
  },
  { timestamps: true }
);

reviewSchema.index(
  { restaurantId: 1, googleKey: 1 },
  { unique: true, partialFilterExpression: { googleKey: { $type: "string" } } }
);
reviewSchema.index({ restaurantId: 1, dupKey: 1, createdAt: -1 });

export default model<IReview>("Review", reviewSchema);
