import { model, Schema, Types } from "mongoose";

export interface IIdempotencyRecord {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  key: string;
  scope: string;
  completed: boolean;
  statusCode?: number;
  response?: unknown;
  createdAt: Date;
}

const idempotencyRecordSchema = new Schema<IIdempotencyRecord>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
    key: { type: String, required: true },
    scope: { type: String, required: true },
    completed: { type: Boolean, default: false },
    statusCode: { type: Number },
    response: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

idempotencyRecordSchema.index({ restaurantId: 1, key: 1 }, { unique: true });
idempotencyRecordSchema.index({ createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

export default model<IIdempotencyRecord>("IdempotencyRecord", idempotencyRecordSchema);
