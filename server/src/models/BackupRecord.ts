import { model, Schema, Types } from "mongoose";

export type BackupTrigger = "manual" | "scheduled";

export interface IBackupRecord {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  filename: string;
  storedAs: string;
  sizeBytes: number;
  trigger: BackupTrigger;
  createdAt: Date;
  updatedAt: Date;
}

const backupRecordSchema = new Schema<IBackupRecord>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    filename: { type: String, required: true },
    storedAs: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    trigger: { type: String, enum: ["manual", "scheduled"], required: true },
  },
  { timestamps: true }
);

export default model<IBackupRecord>("BackupRecord", backupRecordSchema);
