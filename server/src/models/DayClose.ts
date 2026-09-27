import { model, Schema, Types } from "mongoose";

export interface IDayClose {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  businessDate: string;
  businessDayStart: Date;
  businessDayEnd: Date;
  closedAt: Date;
  closedBy?: string;
  closedByName?: string;
  carriedForward: Types.ObjectId[];
  report: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const dayCloseSchema = new Schema<IDayClose>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    businessDate: { type: String, required: true },
    businessDayStart: { type: Date, required: true },
    businessDayEnd: { type: Date, required: true },
    closedAt: { type: Date, default: Date.now },
    closedBy: { type: String },
    closedByName: { type: String },
    carriedForward: { type: [Schema.Types.ObjectId], default: [] },
    report: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

dayCloseSchema.index({ restaurantId: 1, businessDate: 1 }, { unique: true });

export default model<IDayClose>("DayClose", dayCloseSchema);
