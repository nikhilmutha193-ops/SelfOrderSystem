import { Schema, model, Types } from "mongoose";

export interface IAuditLog {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  /** Admin username (or "system") who performed the action. */
  actorName: string;
  actorId?: Types.ObjectId;
  /** Machine action key, e.g. "order.cancel", "order.clear", "order.pay". */
  action: string;
  /** Human-readable summary shown in the log. */
  summary: string;
  createdAt: Date;
  updatedAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    actorName: { type: String, required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "Admin" },
    action: { type: String, required: true, index: true },
    summary: { type: String, required: true },
  },
  { timestamps: true }
);

auditLogSchema.index({ restaurantId: 1, createdAt: -1 });

export default model<IAuditLog>("AuditLog", auditLogSchema);
