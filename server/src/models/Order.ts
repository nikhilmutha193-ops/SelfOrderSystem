import { model, Schema, Types } from "mongoose";

export type OrderType = "dine-in" | "takeaway" | "delivery";
export type OrderStatus = "open" | "billed" | "closed" | "cancelled";

export const ORDER_STATUSES: OrderStatus[] = ["open", "billed", "closed", "cancelled"];
export type OrderSource = "guest" | "counter" | "swiggy" | "zomato";
export type PaymentMethod = "pending" | "cash" | "online" | "card";
export type DeliveryProvider = "Swiggy" | "Zomato" | "Uber-Eats" | "Other";

export interface IBillTaxLine {
  name: string;
  percent: number;
  base: number;
  amount: number;
}

export interface IBillSnapshot {
  subtotal: number;
  discount: number;
  couponCode?: string;
  taxableAmount: number;
  taxLines: IBillTaxLine[];
  roundOff: number;
  grandTotal: number;
  sac: string;
  placeOfSupply: string;
  legacy: boolean;
}

export interface IOrder {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  orderType: OrderType;
  tableId?: Types.ObjectId;
  deliveryProvider?: DeliveryProvider;
  customerName: string;
  customerPhone?: string;
  members: number;
  checkinTime: Date;
  checkoutTime?: Date;
  status: OrderStatus;
  source: OrderSource;
  externalOrderId?: string;
  paymentMethod: PaymentMethod;
  couponCode?: string;
  discountAmount: number;
  estimatedReadyAt?: Date;
  sessionId?: string;
  invoiceNumber?: string;
  financialYear?: string;
  billedAt?: Date | null;
  bill?: IBillSnapshot | null;
  customerGstin?: string;
  kotSeq?: number;
  archivedAt?: Date | null;
  cancelReason?: string;
  voidedAt?: Date | null;
  voidReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const billSnapshotSchema = new Schema<IBillSnapshot>(
  {
    subtotal: { type: Number, required: true },
    discount: { type: Number, required: true },
    couponCode: { type: String },
    taxableAmount: { type: Number, required: true },
    taxLines: {
      type: [new Schema<IBillTaxLine>({ name: String, percent: Number, base: Number, amount: Number }, { _id: false })],
      default: [],
    },
    roundOff: { type: Number, default: 0 },
    grandTotal: { type: Number, required: true },
    sac: { type: String, default: "" },
    placeOfSupply: { type: String, default: "" },
    legacy: { type: Boolean, default: false },
  },
  { _id: false }
);

const orderSchema = new Schema<IOrder>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    orderType: { type: String, enum: ["dine-in", "takeaway", "delivery"], required: true },
    tableId: { type: Schema.Types.ObjectId, ref: "Table" },
    deliveryProvider: { type: String, enum: ["Swiggy", "Zomato", "Uber-Eats", "Other"] },
    customerName: { type: String, required: true, trim: true },
    customerPhone: { type: String, default: "", trim: true },
    members: { type: Number, default: 1, min: 1 },
    checkinTime: { type: Date, default: Date.now },
    checkoutTime: { type: Date },
    status: { type: String, enum: ORDER_STATUSES, default: "open", index: true },
    source: { type: String, enum: ["guest", "counter", "swiggy", "zomato"], default: "guest" },
    externalOrderId: { type: String, trim: true, index: true },
    paymentMethod: { type: String, enum: ["pending", "cash", "online", "card"], default: "pending" },
    couponCode: { type: String, trim: true, uppercase: true },
    discountAmount: { type: Number, default: 0, min: 0 },
    estimatedReadyAt: { type: Date, default: null },
    sessionId: { type: String },
    invoiceNumber: { type: String },
    financialYear: { type: String },
    billedAt: { type: Date },
    bill: { type: billSnapshotSchema, default: null },
    customerGstin: { type: String, trim: true, uppercase: true },
    kotSeq: { type: Number },
    archivedAt: { type: Date, default: null },
    cancelReason: { type: String, trim: true },
    voidedAt: { type: Date, default: null },
    voidReason: { type: String, trim: true },
  },
  { timestamps: true }
);

orderSchema.index(
  { restaurantId: 1, invoiceNumber: 1 },
  { unique: true, partialFilterExpression: { invoiceNumber: { $type: "string" } } }
);
orderSchema.index({ restaurantId: 1, tableId: 1, sessionId: 1, status: 1 });

export default model<IOrder>("Order", orderSchema);
