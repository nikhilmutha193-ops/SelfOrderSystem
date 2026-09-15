import { Schema, model, Types } from "mongoose";

export interface IKotCounter {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  /** Start of the business day this sequence belongs to (honours the day-end cutoff). */
  businessDayStart: Date;
  seq: number;
}

const kotCounterSchema = new Schema<IKotCounter>({
  restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
  businessDayStart: { type: Date, required: true },
  seq: { type: Number, required: true, default: 0 },
});

// One counter per restaurant per day; the unique index is what makes the
// upsert-and-increment below safe when two tickets print at the same moment.
kotCounterSchema.index({ restaurantId: 1, businessDayStart: 1 }, { unique: true });

export default model<IKotCounter>("KotCounter", kotCounterSchema);
