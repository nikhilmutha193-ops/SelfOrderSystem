import { model, Schema, Types } from "mongoose";

export interface ICashMovement {
  type: "in" | "out";
  amount: number;
  reason: string;
  by?: string;
  byName?: string;
  at: Date;
}

export interface IShift {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  openedAt: Date;
  openedBy?: string;
  openedByName?: string;
  openingFloat: number;
  isOpen: boolean;
  cashMovements: ICashMovement[];
  closedAt?: Date | null;
  closedBy?: string;
  closedByName?: string;
  countedCash?: number;
  expectedCash?: number;
  variance?: number;
  closingNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const cashMovementSchema = new Schema<ICashMovement>(
  {
    type: { type: String, enum: ["in", "out"], required: true },
    amount: { type: Number, required: true, min: 0 },
    reason: { type: String, required: true, trim: true },
    by: { type: String },
    byName: { type: String },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const shiftSchema = new Schema<IShift>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    openedAt: { type: Date, default: Date.now },
    openedBy: { type: String },
    openedByName: { type: String },
    openingFloat: { type: Number, required: true, min: 0 },
    isOpen: { type: Boolean, default: true },
    cashMovements: { type: [cashMovementSchema], default: [] },
    closedAt: { type: Date, default: null },
    closedBy: { type: String },
    closedByName: { type: String },
    countedCash: { type: Number, min: 0 },
    expectedCash: { type: Number },
    variance: { type: Number },
    closingNote: { type: String, trim: true },
  },
  { timestamps: true }
);

shiftSchema.index({ restaurantId: 1, isOpen: 1 }, { unique: true, partialFilterExpression: { isOpen: true } });

export default model<IShift>("Shift", shiftSchema);
