import { model, Schema, Types } from "mongoose";

export type PrintJobKind = "kot" | "bill" | "test";
export type PrintJobStatus = "queued" | "sent" | "printed" | "failed";

export interface IPrintJob {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  printerId: Types.ObjectId;
  agentId: Types.ObjectId;
  kind: PrintJobKind;
  title: string;
  data: string;
  status: PrintJobStatus;
  attempts: number;
  lastError?: string;
  orderId?: Types.ObjectId | null;
  round?: number | null;
  sentAt?: Date | null;
  printedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const printJobSchema = new Schema<IPrintJob>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    printerId: { type: Schema.Types.ObjectId, ref: "Printer", required: true },
    agentId: { type: Schema.Types.ObjectId, ref: "PrintAgent", required: true },
    kind: { type: String, enum: ["kot", "bill", "test"], required: true },
    title: { type: String, required: true },
    data: { type: String, required: true },
    status: { type: String, enum: ["queued", "sent", "printed", "failed"], default: "queued" },
    attempts: { type: Number, default: 0 },
    lastError: { type: String },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", default: null },
    round: { type: Number, default: null },
    sentAt: { type: Date, default: null },
    printedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

printJobSchema.index({ agentId: 1, status: 1, createdAt: 1 });
printJobSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

export default model<IPrintJob>("PrintJob", printJobSchema);
