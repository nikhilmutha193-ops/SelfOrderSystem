import { model, Schema, Types } from "mongoose";

/** A saved, reusable bulk-SMS message (e.g. "Diwali Offer", "Live Music Tonight") that staff can
 *  pick from instead of retyping the message each time they run a campaign. */
export interface ISmsTemplate {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  name: string;
  message: string;
  createdAt: Date;
  updatedAt: Date;
}

const smsTemplateSchema = new Schema<ISmsTemplate>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    name: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

export default model<ISmsTemplate>("SmsTemplate", smsTemplateSchema);
