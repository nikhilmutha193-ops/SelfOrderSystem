import { Schema, model, Types } from "mongoose";

export type ChatSenderRole = "table" | "admin";

export interface IChatMessage {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  orderId: Types.ObjectId;
  senderRole: ChatSenderRole;
  senderName: string;
  message: string;
  /** True when the abuse filter masked or would have blocked content in this message. */
  flagged: boolean;
  readByAdmin: boolean;
  readByTable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const chatMessageSchema = new Schema<IChatMessage>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    senderRole: { type: String, enum: ["table", "admin"], required: true },
    senderName: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    flagged: { type: Boolean, default: false },
    readByAdmin: { type: Boolean, default: false },
    readByTable: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default model<IChatMessage>("ChatMessage", chatMessageSchema);
