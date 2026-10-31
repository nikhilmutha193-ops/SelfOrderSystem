import { model, Schema, Types } from "mongoose";

export const DISPLAY_TRANSITIONS = ["fade", "slide", "zoom"] as const;
export type DisplayTransition = (typeof DISPLAY_TRANSITIONS)[number];
export const DISPLAY_FITS = ["cover", "contain"] as const;
export type DisplayFit = (typeof DISPLAY_FITS)[number];

export interface IDisplaySlide {
  _id: Types.ObjectId;
  url: string;
  caption?: string;
  /** Seconds this image stays up; the display's own interval applies when it is not set. */
  seconds?: number;
}

/** A screen (TV, tablet) that shows a full-screen slideshow. Each display has its own images. */
export interface IDisplay {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  name: string;
  /** Random, unguessable part of the screen's address (/display/<code>). */
  code: string;
  active: boolean;
  slides: IDisplaySlide[];
  intervalSeconds: number;
  transition: DisplayTransition;
  fit: DisplayFit;
  showCaptions: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const slideSchema = new Schema<IDisplaySlide>({
  url: { type: String, required: true, trim: true },
  caption: { type: String, trim: true, maxlength: 120 },
  seconds: { type: Number, min: 2, max: 300 },
});

const displaySchema = new Schema<IDisplay>(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    code: { type: String, required: true, unique: true },
    active: { type: Boolean, default: true },
    slides: { type: [slideSchema], default: [] },
    intervalSeconds: { type: Number, default: 8, min: 2, max: 300 },
    transition: { type: String, enum: DISPLAY_TRANSITIONS, default: "fade" },
    fit: { type: String, enum: DISPLAY_FITS, default: "cover" },
    showCaptions: { type: Boolean, default: false },
  },
  { timestamps: true },
);

displaySchema.index({ restaurantId: 1, name: 1 }, { unique: true });

export default model<IDisplay>("Display", displaySchema);
