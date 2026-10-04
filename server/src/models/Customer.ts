import { model, Schema, Types } from "mongoose";

export interface ICustomer {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  phone: string;
  name: string;
  birthday?: string;
  /** Calendar year the birthday SMS was last sent, so the scheduler never texts them twice in
   *  the same year even if it ticks more than once on the day. */
  birthdayGreetedYear?: number;
  anniversary?: string;
  visitCount: number;
  totalSpend: number;
  firstVisitAt?: Date | null;
  lastVisitAt?: Date | null;
  tags: string[];
  marketingConsent: boolean;
  consentAt?: Date | null;
  creditLimit?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const customerSchema = new Schema<ICustomer>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
    phone: { type: String, required: true },
    name: { type: String, trim: true, default: "" },
    birthday: { type: String },
    birthdayGreetedYear: { type: Number },
    anniversary: { type: String },
    visitCount: { type: Number, default: 0 },
    totalSpend: { type: Number, default: 0 },
    firstVisitAt: { type: Date, default: null },
    lastVisitAt: { type: Date, default: null },
    tags: { type: [String], default: [] },
    marketingConsent: { type: Boolean, default: false },
    consentAt: { type: Date, default: null },
    creditLimit: { type: Number, default: null, min: 0 },
  },
  { timestamps: true }
);

customerSchema.index({ restaurantId: 1, phone: 1 }, { unique: true });
customerSchema.index({ restaurantId: 1, lastVisitAt: -1 });

export default model<ICustomer>("Customer", customerSchema);
