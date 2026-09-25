import { model, Schema, Types } from "mongoose";

export interface IKotCounter {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  businessDayStart: Date;
  seq: number;
}

const kotCounterSchema = new Schema<IKotCounter>({
  restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
  businessDayStart: { type: Date, required: true },
  seq: { type: Number, required: true, default: 0 },
});

kotCounterSchema.index({ restaurantId: 1, businessDayStart: 1 }, { unique: true });

export default model<IKotCounter>("KotCounter", kotCounterSchema);
