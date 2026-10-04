import { model, Schema, Types } from "mongoose";

/** A popup ad/offer poster shown over the landing page. Admin can list several; only the first
 *  active one (by sortOrder) is shown to a given visitor at a time (see landing.controller.ts). */
export interface IPromoBanner {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  title?: string;
  desktopImageUrl: string;
  /** Falls back to desktopImageUrl on the public page if left blank. */
  mobileImageUrl?: string;
  linkUrl?: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const promoBannerSchema = new Schema<IPromoBanner>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    title: { type: String, default: "" },
    desktopImageUrl: { type: String, required: true },
    mobileImageUrl: { type: String, default: "" },
    linkUrl: { type: String, default: "" },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default model<IPromoBanner>("PromoBanner", promoBannerSchema);
