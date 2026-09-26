import { model, Schema, Types } from "mongoose";

import { DEFAULT_TIMEZONE } from "../utils/businessDay";

export interface ITaxRate {
  name: string;
  percent: number;
}

export interface IQrSettings {
  showLogo: boolean;
  showName: boolean;
  showAddress: boolean;
  instructionText: string;
  accentColor: string;
}

export type PrintPaperSize = "thermal58" | "thermal80" | "a5" | "a4";

export type PrintFontSize = "compact" | "normal" | "large";

export interface IKotSettings {
  headerText: string;
  showCustomerName: boolean;
  showTableInfo: boolean;
  footerNote: string;
  paperSize: PrintPaperSize;
  fontSize: PrintFontSize;
  showLogo: boolean;
  showPrices: boolean;
  showJainTag: boolean;
}

export interface IInvoiceSettings {
  invoicePrefix: string;
  placeOfSupply: string;
  showCustomerPhone: boolean;
  footerNote: string;
  termsText: string;
  paperSize: PrintPaperSize;
  fontSize: PrintFontSize;
  showLogo: boolean;
  showUnitPrice: boolean;
  showJainTag: boolean;
}

export interface IBackupSchedule {
  enabled: boolean;
  time: string;
  lastRunAt?: Date;
}

export interface IChatModeration {
  enabled: boolean;
  mode: "mask" | "block";
  customWords: string[];
}

export interface IRestaurant {
  _id: Types.ObjectId;
  name: string;
  key: string;
  logoUrl?: string;
  siteTitle?: string;
  faviconUrl?: string;
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
  prepBufferMinutes: number;
  prepMessageTemplate: string;
  chatModeration: IChatModeration;
  aggregatorWebhookSecret?: string;
  taxRates: ITaxRate[];
  qrSettings: IQrSettings;
  kotSettings: IKotSettings;
  invoiceSettings: IInvoiceSettings;
  backupSchedule: IBackupSchedule;
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

const kotSettingsSchema = new Schema<IKotSettings>(
  {
    headerText: { type: String, default: "Kitchen Order Ticket" },
    showCustomerName: { type: Boolean, default: true },
    showTableInfo: { type: Boolean, default: true },
    footerNote: { type: String, default: "" },
    paperSize: { type: String, enum: PRINT_PAPER_SIZES, default: "thermal80" },
    fontSize: { type: String, enum: PRINT_FONT_SIZES, default: "normal" },
    showLogo: { type: Boolean, default: false },
    showPrices: { type: Boolean, default: false },
    showJainTag: { type: Boolean, default: true },
  },
  { _id: false }
);

const invoiceSettingsSchema = new Schema<IInvoiceSettings>(
  {
    invoicePrefix: { type: String, default: "INV", trim: true, uppercase: true },
    placeOfSupply: { type: String, default: "", trim: true },
    showCustomerPhone: { type: Boolean, default: true },
    footerNote: { type: String, default: "Thank you for dining with us!" },
    termsText: { type: String, default: "" },
    paperSize: { type: String, enum: PRINT_PAPER_SIZES, default: "a5" },
    fontSize: { type: String, enum: PRINT_FONT_SIZES, default: "normal" },
    showLogo: { type: Boolean, default: true },
    showUnitPrice: { type: Boolean, default: true },
    showJainTag: { type: Boolean, default: true },
  },
  { _id: false }
);

const backupScheduleSchema = new Schema<IBackupSchedule>(
  {
    enabled: { type: Boolean, default: false },
    time: { type: String, default: "02:00" },
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
    siteTitle: { type: String, default: "" },
    faviconUrl: { type: String, default: "" },
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
    prepBufferMinutes: { type: Number, default: 2, min: 0 },
    prepMessageTemplate: {
      type: String,
      default: "Your order should be ready in about {minutes} minutes (around {time}).",
    },
    taxRates: { type: [taxRateSchema], default: [] },
    qrSettings: { type: qrSettingsSchema, default: () => ({}) },
    kotSettings: { type: kotSettingsSchema, default: () => ({}) },
    invoiceSettings: { type: invoiceSettingsSchema, default: () => ({}) },
    backupSchedule: { type: backupScheduleSchema, default: () => ({}) },
    chatModeration: { type: chatModerationSchema, default: () => ({}) },
    aggregatorWebhookSecret: { type: String, default: "" },
  },
  { timestamps: true }
);

export default model<IRestaurant>("Restaurant", restaurantSchema);
