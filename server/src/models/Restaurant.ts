import { model, Schema, Types } from "mongoose";

import { DEFAULT_TIMEZONE } from "../utils/businessDay";

export interface ITaxRate {
  name: string;
  percent: number;
}

export interface IFeedbackQr {
  showLogo: boolean;
  showName: boolean;
  showAddress: boolean;
  heading: string;
  instructionText: string;
  accentColor: string;
}

export interface IQrSettings {
  showLogo: boolean;
  showName: boolean;
  showAddress: boolean;
  instructionText: string;
  accentColor: string;
}

/** Controls what the public table sign-in page (/order) offers, besides the code+PIN form. */
/** What a guest may do, depending on how they signed in to the table. */
export interface IGuestAccess {
  placeOrder: boolean;
  showMenu: boolean;
  showFeedback: boolean;
  /** The "Rate us" button in the menu page's options. Off until the admin turns it on. */
  showRateUs: boolean;
}

/**
 * Which guest details are asked before a table guest's first order. Name and members are required;
 * phone and birthday are only offered (always optional). Anything unticked is not asked.
 */
export interface IRequiredDetails {
  name: boolean;
  phone: boolean;
  members: boolean;
  birthday: boolean;
}

export interface ITableLoginSettings {
  allowQrScan: boolean;
  /** Show the "Order now" buttons on the public landing page. */
  showOrderNow: boolean;
  /** Guests may sign in to a table through its QR code (scanned or opened as a link). */
  allowQrLogin: boolean;
  /** Guests may sign in to a table with its code and PIN. */
  allowPinLogin: boolean;
  /** Guests may follow an order by the token number on their receipt. Unset follows the service flow (cafe on). */
  allowTokenLogin?: boolean;
  requiredDetails: IRequiredDetails;
  /** Guests who scanned the table's QR code. */
  qr: IGuestAccess;
  /** Guests who typed the table code and PIN. */
  manual: IGuestAccess;
}

export type PrintPaperSize = "thermal58" | "thermal80" | "a5" | "a4";

export type PrintFontSize = "compact" | "normal" | "large";

export type GuestOrderMode = "auto" | "accept";

/** restaurant: order, cook, serve, then bill and pay. cafe: pay first, and the kitchen gets the order once it is paid. */
export type ServiceFlow = "restaurant" | "cafe";
export const SERVICE_FLOWS: ServiceFlow[] = ["restaurant", "cafe"];

export interface IKotSettings {
  guestOrderMode: GuestOrderMode;
  headerText: string;
  showCustomerName: boolean;
  showTableInfo: boolean;
  footerNote: string;
  paperSize: PrintPaperSize;
  fontSize: PrintFontSize;
  showLogo: boolean;
  showPrices: boolean;
  showJainTag: boolean;
  /** One ticket per menu category (sharing the round's token) instead of one per station. */
  splitByCategory: boolean;
  /** With the split on: categories listed together share one ticket (each group has two or more). */
  categoryGroups?: { categoryIds: Types.ObjectId[] }[];
  /** First token number of each business day. */
  tokenStart: number;
  /** Details shown and text sizes per paper (58 mm, 80 mm, page), see utils/printLayout.ts. */
  layouts?: Record<string, unknown>;
  /** Steps a dish goes through in the kitchen. Switching one off skips it (see utils/kotSteps.ts). */
  steps?: { preparing: boolean; ready: boolean; served: boolean };
}

export interface IInvoiceSettings {
  invoicePrefix: string;
  placeOfSupply: string;
  autoPrintBill: boolean;
  showCustomerPhone: boolean;
  /** Bills show the customer's mobile number with the middle digits hidden. */
  maskCustomerPhone: boolean;
  footerNote: string;
  termsText: string;
  paperSize: PrintPaperSize;
  fontSize: PrintFontSize;
  showLogo: boolean;
  showUnitPrice: boolean;
  showJainTag: boolean;
  /** Details shown and text sizes per paper (58 mm, 80 mm, page), see utils/printLayout.ts. */
  layouts?: Record<string, unknown>;
}

export interface IBackupSchedule {
  enabled: boolean;
  /** The first time of the day, kept for settings saved before there could be several. */
  time: string;
  /** Every time of day (HH:mm) a backup runs; empty on old settings, where `time` is the only one. */
  times: string[];
  lastRunAt?: Date;
}

export interface IChatModeration {
  enabled: boolean;
  mode: "mask" | "block";
  customWords: string[];
}

/**
 * When dine-in guests pay. "after": they eat, then pay the bill (tables wait for payment).
 * "upfront": each order is paid before it goes to the kitchen and the table stays seated
 * until staff release it. Takeaway works the same either way.
 */
export type DineInPayment = "after" | "upfront";

/** Self-order kiosks (modules/kiosk). */
export interface IKioskSettings {
  eatIn: boolean;
  takeaway: boolean;
  /** Guests may place the order and pay cash at the counter; it goes to the kitchen once paid there. */
  payAtCounter: boolean;
  /** Seconds without a touch before the kiosk asks "Still there?" and then starts over. */
  idleSeconds: number;
}

/** A named extra charge on the bill (delivery, cutlery, parcel box...), fixed or a percent of the bill. */
export interface IExtraCharge {
  key: string;
  name: string;
  type: "fixed" | "percent";
  value: number;
  /** Order types it applies to when it is automatic. */
  orderTypes: ("dine-in" | "takeaway" | "delivery")[];
  /** Added to matching orders by itself; staff can still remove it from one order. */
  autoApply: boolean;
  active: boolean;
}

export interface IBillingSettings {
  serviceChargePercent: number;
  /** `perPlate` uses each dish's own packaging charge; `flat` charges one amount per order. */
  packagingMode: "perPlate" | "flat";
  packagingFlatCharge: number;
  extraCharges: IExtraCharge[];
  maxStaffDiscountPercent: number;
  upiVpa: string;
  upiPayeeName: string;
  /** Retired: how you serve (cafe flow) now decides this. Only read for settings saved before. */
  dineInPayment: DineInPayment;
  /** Takeaway and counter orders are paid first and reach the kitchen once paid (restaurant flow; cafe always does). */
  takeawayPayFirst: boolean;
  /** False: the POS has no table map and starts every order without a table (counter service). Default true. */
  posUseTables: boolean;
  /** Which ways a guest sees to pay their own order (staff screens are not affected). */
  guestPayOptions: { online: boolean; upiQr: boolean; counter: boolean };
}

export interface ILoyaltySettings {
  enabled: boolean;
  pointsPer100: number;
  pointValue: number;
  minRedeem: number;
  expiryDays: number;
}

export interface IInventorySettings {
  autoSoldOut: boolean;
}

export interface IBookingSettings {
  enabled: boolean;
  /** "HH:mm" local time (restaurant's timezone) the first bookable slot starts. */
  openTime: string;
  /** "HH:mm" local time the last bookable slot must end by. */
  closeTime: string;
  /** Length of one slot in minutes, e.g. 30 for 11:00-11:30, 11:30-12:00, ... */
  slotMinutes: number;
}

export interface IArea {
  _id: Types.ObjectId;
  name: string;
}

export interface IBirthdaySmsSettings {
  enabled: boolean;
  /** {name} and {restaurant} are substituted in; see utils/birthdaySmsScheduler.ts. */
  template: string;
}

/** The "under maintenance" page: shown instead of the public site, guest, kiosk and chef pages while it is active. */
export interface IMaintenance {
  /** The switch. With no start and end it is on until switched off; with a window it applies only inside it. */
  enabled: boolean;
  startAt?: Date | null;
  endAt?: Date | null;
  title: string;
  message: string;
  imageUrl: string;
}

export interface IRestaurant {
  _id: Types.ObjectId;
  name: string;
  key: string;
  logoUrl?: string;
  /** The "write a review" link of the Google Business Profile; happy guests of the feedback QR are sent there. */
  googleReviewUrl?: string;
  /** Ratings from this many stars up are offered the Google review link (default 4). */
  googleMinStars?: number;
  /** How the feedback QR card looks (logo, name, address, the lines under the QR, accent colour). */
  feedbackQr?: IFeedbackQr;
  siteTitle?: string;
  faviconUrl?: string;
  /** "#rrggbb", or "" for the built-in terracotta. Every screen's accent palette is built from it (client/src/shared/brand.ts). */
  brandColor?: string;
  address?: string;
  gstin?: string;
  fssaiLicense?: string;
  tagline?: string;
  aboutText?: string;
  publicUrl?: string;
  heroImages: string[];
  dayEndTime: string;
  timezone: string;
  tableAutoReleaseMinutes: number;
  serviceFlow: ServiceFlow;
  prepBufferMinutes: number;
  prepMessageTemplate: string;
  chatModeration: IChatModeration;
  aggregatorWebhookSecret?: string;
  taxRates: ITaxRate[];
  qrSettings: IQrSettings;
  tableLoginSettings: ITableLoginSettings;
  kotSettings: IKotSettings;
  kioskSettings: IKioskSettings;
  invoiceSettings: IInvoiceSettings;
  billingSettings: IBillingSettings;
  inventorySettings: IInventorySettings;
  loyaltySettings: ILoyaltySettings;
  bookingSettings: IBookingSettings;
  areas: IArea[];
  birthdaySmsSettings: IBirthdaySmsSettings;
  backupSchedule: IBackupSchedule;
  maintenance: IMaintenance;
  createdAt: Date;
  updatedAt: Date;
}

export const PRINT_PAPER_SIZES: PrintPaperSize[] = ["thermal58", "thermal80", "a5", "a4"];

export const PRINT_FONT_SIZES: PrintFontSize[] = ["compact", "normal", "large"];

const taxRateSchema = new Schema<ITaxRate>(
  {
    name: { type: String, required: true, trim: true },
    percent: { type: Number, required: true, min: 0, max: 100 },
  },
  { _id: true }
);

const feedbackQrSchema = new Schema<IFeedbackQr>(
  {
    showLogo: { type: Boolean, default: true },
    showName: { type: Boolean, default: true },
    showAddress: { type: Boolean, default: false },
    heading: { type: String, default: "Rate your visit", trim: true, maxlength: 40 },
    instructionText: { type: String, default: "Scan to share your feedback", trim: true, maxlength: 80 },
    accentColor: { type: String, default: "#ea580c" },
  },
  { _id: false }
);

const qrSettingsSchema = new Schema<IQrSettings>(
  {
    showLogo: { type: Boolean, default: true },
    showName: { type: Boolean, default: true },
    showAddress: { type: Boolean, default: false },
    instructionText: { type: String, default: "Scan to view menu & order" },
    accentColor: { type: String, default: "#ea580c" },
  },
  { _id: false }
);

const guestAccessSchema = new Schema<IGuestAccess>(
  {
    placeOrder: { type: Boolean, default: true },
    showMenu: { type: Boolean, default: true },
    showFeedback: { type: Boolean, default: true },
    showRateUs: { type: Boolean, default: false },
  },
  { _id: false }
);

const requiredDetailsSchema = new Schema<IRequiredDetails>(
  {
    name: { type: Boolean, default: true },
    phone: { type: Boolean, default: false },
    members: { type: Boolean, default: true },
    birthday: { type: Boolean, default: false },
  },
  { _id: false }
);

const tableLoginSettingsSchema = new Schema<ITableLoginSettings>(
  {
    allowQrScan: { type: Boolean, default: true },
    showOrderNow: { type: Boolean, default: true },
    allowQrLogin: { type: Boolean, default: true },
    allowPinLogin: { type: Boolean, default: true },
    allowTokenLogin: { type: Boolean },
    requiredDetails: { type: requiredDetailsSchema, default: () => ({}) },
    qr: { type: guestAccessSchema, default: () => ({}) },
    manual: { type: guestAccessSchema, default: () => ({}) },
  },
  { _id: false }
);

const kotSettingsSchema = new Schema<IKotSettings>(
  {
    guestOrderMode: { type: String, enum: ["auto", "accept"], default: "auto" },
    headerText: { type: String, default: "Kitchen Order Ticket" },
    showCustomerName: { type: Boolean, default: true },
    showTableInfo: { type: Boolean, default: true },
    footerNote: { type: String, default: "" },
    paperSize: { type: String, enum: PRINT_PAPER_SIZES, default: "thermal80" },
    fontSize: { type: String, enum: PRINT_FONT_SIZES, default: "normal" },
    showLogo: { type: Boolean, default: false },
    showPrices: { type: Boolean, default: false },
    showJainTag: { type: Boolean, default: true },
    splitByCategory: { type: Boolean, default: false },
    categoryGroups: {
      type: [new Schema({ categoryIds: [{ type: Schema.Types.ObjectId, ref: "Category" }] }, { _id: false })],
      default: [],
    },
    tokenStart: { type: Number, default: 1, min: 1, max: 99999 },
    layouts: { type: Schema.Types.Mixed, default: () => ({}) },
    steps: {
      type: new Schema(
        {
          preparing: { type: Boolean, default: true },
          ready: { type: Boolean, default: true },
          served: { type: Boolean, default: true },
        },
        { _id: false }
      ),
      default: () => ({}),
    },
  },
  { _id: false }
);

const invoiceSettingsSchema = new Schema<IInvoiceSettings>(
  {
    invoicePrefix: { type: String, default: "INV", trim: true, uppercase: true },
    placeOfSupply: { type: String, default: "", trim: true },
    autoPrintBill: { type: Boolean, default: false },
    showCustomerPhone: { type: Boolean, default: true },
    maskCustomerPhone: { type: Boolean, default: false },
    footerNote: { type: String, default: "Thank you for dining with us!" },
    termsText: { type: String, default: "" },
    paperSize: { type: String, enum: PRINT_PAPER_SIZES, default: "a5" },
    fontSize: { type: String, enum: PRINT_FONT_SIZES, default: "normal" },
    showLogo: { type: Boolean, default: true },
    showUnitPrice: { type: Boolean, default: true },
    showJainTag: { type: Boolean, default: true },
    layouts: { type: Schema.Types.Mixed, default: () => ({}) },
  },
  { _id: false }
);

const billingSettingsSchema = new Schema<IBillingSettings>(
  {
    serviceChargePercent: { type: Number, default: 0, min: 0, max: 20 },
    packagingMode: { type: String, enum: ["perPlate", "flat"], default: "perPlate" },
    packagingFlatCharge: { type: Number, default: 0, min: 0 },
    extraCharges: {
      type: [
        new Schema<IExtraCharge>(
          {
            key: { type: String, required: true },
            name: { type: String, required: true, trim: true, maxlength: 40 },
            type: { type: String, enum: ["fixed", "percent"], default: "fixed" },
            value: { type: Number, default: 0, min: 0 },
            orderTypes: { type: [String], enum: ["dine-in", "takeaway", "delivery"], default: [] },
            autoApply: { type: Boolean, default: false },
            active: { type: Boolean, default: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    maxStaffDiscountPercent: { type: Number, default: 10, min: 0, max: 100 },
    upiVpa: { type: String, default: "", trim: true },
    upiPayeeName: { type: String, default: "", trim: true },
    dineInPayment: { type: String, enum: ["after", "upfront"], default: "after" },
    takeawayPayFirst: { type: Boolean, default: false },
    posUseTables: { type: Boolean, default: true },
    guestPayOptions: {
      type: new Schema(
        {
          online: { type: Boolean, default: true },
          upiQr: { type: Boolean, default: true },
          counter: { type: Boolean, default: true },
        },
        { _id: false }
      ),
      default: () => ({}),
    },
  },
  { _id: false }
);

const backupScheduleSchema = new Schema<IBackupSchedule>(
  {
    enabled: { type: Boolean, default: false },
    time: { type: String, default: "02:00" },
    times: { type: [String], default: [] },
    lastRunAt: { type: Date },
  },
  { _id: false }
);

const chatModerationSchema = new Schema<IChatModeration>(
  {
    enabled: { type: Boolean, default: true },
    mode: { type: String, enum: ["mask", "block"], default: "mask" },
    customWords: { type: [String], default: [] },
  },
  { _id: false }
);

const restaurantSchema = new Schema<IRestaurant>(
  {
    name: { type: String, required: true, trim: true },
    key: { type: String, required: true, unique: true, trim: true, lowercase: true },
    logoUrl: { type: String, default: "" },
    googleReviewUrl: { type: String, default: "", trim: true },
    googleMinStars: { type: Number, default: 4, min: 1, max: 5 },
    feedbackQr: { type: feedbackQrSchema, default: () => ({}) },
    siteTitle: { type: String, default: "" },
    faviconUrl: { type: String, default: "" },
    brandColor: { type: String, default: "" },
    address: { type: String, default: "" },
    gstin: { type: String, default: "" },
    fssaiLicense: { type: String, default: "" },
    tagline: { type: String, default: "" },
    aboutText: { type: String, default: "" },
    publicUrl: { type: String, default: "" },
    heroImages: { type: [String], default: [] },
    dayEndTime: { type: String, default: "00:00" },
    timezone: { type: String, default: DEFAULT_TIMEZONE },
    tableAutoReleaseMinutes: { type: Number, default: 0, min: 0 },
    serviceFlow: { type: String, enum: SERVICE_FLOWS, default: "restaurant" },
    prepBufferMinutes: { type: Number, default: 2, min: 0 },
    prepMessageTemplate: {
      type: String,
      default: "Your order should be ready in about {minutes} minutes (around {time}).",
    },
    taxRates: { type: [taxRateSchema], default: [] },
    qrSettings: { type: qrSettingsSchema, default: () => ({}) },
    tableLoginSettings: { type: tableLoginSettingsSchema, default: () => ({}) },
    kotSettings: { type: kotSettingsSchema, default: () => ({}) },
    kioskSettings: {
      type: new Schema<IKioskSettings>(
        {
          eatIn: { type: Boolean, default: true },
          takeaway: { type: Boolean, default: true },
          payAtCounter: { type: Boolean, default: true },
          idleSeconds: { type: Number, default: 60, min: 20, max: 300 },
        },
        { _id: false }
      ),
      default: () => ({}),
    },
    invoiceSettings: { type: invoiceSettingsSchema, default: () => ({}) },
    billingSettings: { type: billingSettingsSchema, default: () => ({}) },
    loyaltySettings: {
      type: new Schema<ILoyaltySettings>(
        {
          enabled: { type: Boolean, default: false },
          pointsPer100: { type: Number, default: 5, min: 0 },
          pointValue: { type: Number, default: 1, min: 0 },
          minRedeem: { type: Number, default: 50, min: 0 },
          expiryDays: { type: Number, default: 365, min: 0 },
        },
        { _id: false }
      ),
      default: () => ({}),
    },
    inventorySettings: {
      type: new Schema<IInventorySettings>({ autoSoldOut: { type: Boolean, default: false } }, { _id: false }),
      default: () => ({}),
    },
    bookingSettings: {
      type: new Schema<IBookingSettings>(
        {
          enabled: { type: Boolean, default: false },
          openTime: { type: String, default: "11:00" },
          closeTime: { type: String, default: "22:00" },
          slotMinutes: { type: Number, default: 30, min: 5, max: 240 },
        },
        { _id: false }
      ),
      default: () => ({}),
    },
    areas: {
      type: [new Schema<IArea>({ name: { type: String, required: true, trim: true } })],
      default: [],
    },
    birthdaySmsSettings: {
      type: new Schema<IBirthdaySmsSettings>(
        {
          enabled: { type: Boolean, default: false },
          template: {
            type: String,
            default: "Happy Birthday {name}! From all of us at {restaurant}, have a wonderful day. See you soon!",
          },
        },
        { _id: false }
      ),
      default: () => ({}),
    },
    backupSchedule: { type: backupScheduleSchema, default: () => ({}) },
    maintenance: {
      type: new Schema<IMaintenance>(
        {
          enabled: { type: Boolean, default: false },
          startAt: { type: Date, default: null },
          endAt: { type: Date, default: null },
          title: { type: String, default: "We'll be back soon", maxlength: 100 },
          message: {
            type: String,
            default: "We are doing some maintenance on our website. Please check back shortly.",
            maxlength: 1000,
          },
          imageUrl: { type: String, default: "" },
        },
        { _id: false }
      ),
      default: () => ({}),
    },
    chatModeration: { type: chatModerationSchema, default: () => ({}) },
    aggregatorWebhookSecret: { type: String, default: "" },
  },
  { timestamps: true }
);

export default model<IRestaurant>("Restaurant", restaurantSchema);
