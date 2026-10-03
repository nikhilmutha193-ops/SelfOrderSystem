import { model, Schema, Types } from "mongoose";

export type OrderType = "dine-in" | "takeaway" | "delivery";
export type OrderStatus = "open" | "billed" | "closed" | "cancelled";

export const ORDER_STATUSES: OrderStatus[] = ["open", "billed", "closed", "cancelled"];
export type OrderSource = "guest" | "counter" | "swiggy" | "zomato";
export type PaymentMethod = "pending" | "cash" | "upi" | "card" | "online" | "wallet" | "credit" | "split";
export type TenderMethod = "cash" | "upi" | "card" | "online" | "wallet" | "credit";

export const TENDER_METHODS: TenderMethod[] = ["cash", "upi", "card", "online", "wallet", "credit"];

export interface IPayment {
  method: TenderMethod;
  amount: number;
  reference?: string;
  tendered?: number;
  change?: number;
  receivedBy?: string;
  receivedByName?: string;
  at: Date;
}

export interface IManualDiscount {
  type: "percent" | "flat";
  value: number;
  reason: string;
  by?: string;
}
export type DeliveryProvider = "Swiggy" | "Zomato" | "Uber-Eats" | "Other";

export interface IBillTaxLine {
  name: string;
  percent: number;
  base: number;
  amount: number;
}

export interface IBillSnapshot {
  subtotal: number;
  couponDiscount?: number;
  manualDiscount?: number;
  loyaltyDiscount?: number;
  discount: number;
  serviceChargePercent?: number;
  serviceCharge?: number;
  packagingCharge?: number;
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
  cancelledAt?: Date | null;
  voidedAt?: Date | null;
  voidReason?: string;
  payments: IPayment[];
  manualDiscount?: IManualDiscount | null;
  customerId?: Types.ObjectId | null;
  loyaltyRedeem?: { points: number; amount: number } | null;
  serviceChargeWaived?: boolean;
  mergedInto?: Types.ObjectId | null;
  splitFrom?: Types.ObjectId | null;
  offline?: IOfflineSync | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IOfflineSync {
  clientId: string;
  createdAt: Date;
  clientTotal: number;
  syncedAt: Date;
  mismatch: boolean;
  note?: string;
}

const paymentSchema = new Schema<IPayment>(
  {
    method: { type: String, enum: TENDER_METHODS, required: true },
    amount: { type: Number, required: true, min: 0 },
    reference: { type: String, trim: true },
    tendered: { type: Number, min: 0 },
    change: { type: Number, min: 0 },
    receivedBy: { type: String },
    receivedByName: { type: String },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const manualDiscountSchema = new Schema<IManualDiscount>(
  {
    type: { type: String, enum: ["percent", "flat"], required: true },
    value: { type: Number, required: true, min: 0 },
    reason: { type: String, required: true, trim: true },
    by: { type: String },
  },
  { _id: false }
);

const billSnapshotSchema = new Schema<IBillSnapshot>(
  {
    subtotal: { type: Number, required: true },
    couponDiscount: { type: Number, default: 0 },
    manualDiscount: { type: Number, default: 0 },
    loyaltyDiscount: { type: Number, default: 0 },
    discount: { type: Number, required: true },
    serviceChargePercent: { type: Number, default: 0 },
    serviceCharge: { type: Number, default: 0 },
    packagingCharge: { type: Number, default: 0 },
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
    paymentMethod: {
      type: String,
      enum: ["pending", "cash", "upi", "card", "online", "wallet", "credit", "split"],
      default: "pending",
    },
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
    cancelledAt: { type: Date, default: null },
    voidedAt: { type: Date, default: null },
    voidReason: { type: String, trim: true },
    payments: { type: [paymentSchema], default: [] },
    manualDiscount: { type: manualDiscountSchema, default: null },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", default: null },
    loyaltyRedeem: {
      type: new Schema(
        { points: { type: Number, required: true }, amount: { type: Number, required: true } },
        { _id: false }
      ),
      default: null,
    },
    serviceChargeWaived: { type: Boolean, default: false },
    mergedInto: { type: Schema.Types.ObjectId, ref: "Order", default: null },
    splitFrom: { type: Schema.Types.ObjectId, ref: "Order", default: null },
    offline: {
      type: new Schema<IOfflineSync>(
        {
          clientId: { type: String, required: true },
          createdAt: { type: Date, required: true },
          clientTotal: { type: Number, required: true },
          syncedAt: { type: Date, required: true },
          mismatch: { type: Boolean, default: false },
          note: { type: String },
        },
        { _id: false }
      ),
      default: null,
    },
  },
  { timestamps: true }
);

orderSchema.index(
  { restaurantId: 1, invoiceNumber: 1 },
  { unique: true, partialFilterExpression: { invoiceNumber: { $type: "string" } } }
);
orderSchema.index({ restaurantId: 1, tableId: 1, sessionId: 1, status: 1 });
orderSchema.index(
  { restaurantId: 1, "offline.clientId": 1 },
  { unique: true, partialFilterExpression: { "offline.clientId": { $type: "string" } } }
);

export default model<IOrder>("Order", orderSchema);
