import { model, Schema, Types } from "mongoose";

export interface ICustomer {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  phone: string;
  name: string;
  birthday?: string;
  anniversary?: string;
  visitCount: number;
  totalSpend: number;
  firstVisitAt?: Date | null;
  lastVisitAt?: Date | null;
  tags: string[];
  marketingConsent: boolean;
  consentAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const customerSchema = new Schema<ICustomer>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
    phone: { type: String, required: true },
    name: { type: String, trim: true, default: "" },
    birthday: { type: String },
    anniversary: { type: String },
    visitCount: { type: Number, default: 0 },
    totalSpend: { type: Number, default: 0 },
    firstVisitAt: { type: Date, default: null },
    lastVisitAt: { type: Date, default: null },
    tags: { type: [String], default: [] },
    marketingConsent: { type: Boolean, default: false },
    consentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

customerSchema.index({ restaurantId: 1, phone: 1 }, { unique: true });
customerSchema.index({ restaurantId: 1, lastVisitAt: -1 });

export default model<ICustomer>("Customer", customerSchema);
