import { Schema, model, Types } from "mongoose";

export type TableStatus = "available" | "occupied";

export interface ITable {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  code: string;
  passwordHash: string;
  password: string;
  status: TableStatus;
  /** Identifies the guest session currently seated here; cleared when the table is released. */
  sessionId?: string;
  /** When the table became occupied; drives auto-release. Cleared when it is freed. */
  occupiedAt?: Date;
  /** A walk-in/counter table: shared, never marked occupied, no PIN gate on seating. */
  isGuest: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const tableSchema = new Schema<ITable>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    code: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    password: { type: String, required: true },
    status: { type: String, enum: ["available", "occupied"], default: "available" },
    sessionId: { type: String, default: null },
    occupiedAt: { type: Date, default: null },
    isGuest: { type: Boolean, default: false },
  },
  { timestamps: true }
);

tableSchema.index({ restaurantId: 1, code: 1 }, { unique: true });

export default model<ITable>("Table", tableSchema);
