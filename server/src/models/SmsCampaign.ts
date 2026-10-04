import { model, Schema, Types } from "mongoose";

/** A record of one bulk SMS blast sent to customers who agreed to receive offers - kept for
 *  history, never re-sent. See customers.service.ts's sendSmsCampaign. */
export interface ISmsCampaign {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  message: string;
  recipientCount: number;
  sentCount: number;
  sentBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const smsCampaignSchema = new Schema<ISmsCampaign>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    message: { type: String, required: true },
    recipientCount: { type: Number, required: true },
    sentCount: { type: Number, required: true },
    sentBy: { type: String, default: "" },
  },
  { timestamps: true }
);

export default model<ISmsCampaign>("SmsCampaign", smsCampaignSchema);
