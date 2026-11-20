import { Model, Types } from "mongoose";

import { getR2 } from "../config/r2";
import Award from "../models/Award";
import BackupRecord, { BackupTrigger, IBackupRecord } from "../models/BackupRecord";
import Booking from "../models/Booking";
import Category from "../models/Category";
import ChatMessage from "../models/ChatMessage";
import Chef from "../models/Chef";
import Coupon from "../models/Coupon";
import CouponRedemption from "../models/CouponRedemption";
import CreditEntry from "../models/CreditEntry";
import Customer from "../models/Customer";
import DayClose from "../models/DayClose";
import FoodItem from "../models/FoodItem";
import FoodReview from "../models/FoodReview";
import InvoiceCounter from "../models/InvoiceCounter";
import LandingContent from "../models/LandingContent";
import LoyaltyEntry from "../models/LoyaltyEntry";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import PaymentAttempt from "../models/PaymentAttempt";
import Printer from "../models/Printer";
import PromoBanner from "../models/PromoBanner";
import Purchase from "../models/Purchase";
import Recipe from "../models/Recipe";
import Restaurant from "../models/Restaurant";
import Review from "../models/Review";
import Shift from "../models/Shift";
import Refund from "../models/Refund";
import SmsCampaign from "../models/SmsCampaign";
import SmsTemplate from "../models/SmsTemplate";
import Display from "../models/Display";
import Station from "../models/Station";
import StockCount from "../models/StockCount";
import StockItem from "../models/StockItem";
import StockMovement from "../models/StockMovement";
import Subcategory from "../models/Subcategory";
import TableModel from "../models/Table";
import TeamMember from "../models/TeamMember";
import Vendor from "../models/Vendor";
import { HttpError } from "./httpError";
import { deleteObject, getObject, putObject } from "./objectStore";

const RETENTION_LIMIT = 30;

const TENANT_MODELS: { key: string; model: Model<any> }[] = [
  { key: "categories", model: Category },
  { key: "subcategories", model: Subcategory },
  { key: "foodItems", model: FoodItem },
  { key: "tables", model: TableModel },
  { key: "chefs", model: Chef },
  { key: "team", model: TeamMember },
  { key: "awards", model: Award },
  { key: "coupons", model: Coupon },
  { key: "couponRedemptions", model: CouponRedemption },
  { key: "reviews", model: Review },
  { key: "orders", model: Order },
  { key: "orderItems", model: OrderItem },
  { key: "chatMessages", model: ChatMessage },
  { key: "invoiceCounters", model: InvoiceCounter },
  { key: "shifts", model: Shift },
  { key: "dayCloses", model: DayClose },
  { key: "stations", model: Station },
  { key: "displays", model: Display },
  { key: "printers", model: Printer },
  { key: "stockItems", model: StockItem },
  { key: "recipes", model: Recipe },
  { key: "stockMovements", model: StockMovement },
  { key: "vendors", model: Vendor },
  { key: "purchases", model: Purchase },
  { key: "stockCounts", model: StockCount },
  { key: "customers", model: Customer },
  { key: "loyaltyEntries", model: LoyaltyEntry },
  { key: "bookings", model: Booking },
  { key: "foodReviews", model: FoodReview },
  { key: "landingContent", model: LandingContent },
  { key: "creditEntries", model: CreditEntry },
  { key: "promoBanners", model: PromoBanner },
  { key: "smsTemplates", model: SmsTemplate },
  { key: "smsCampaigns", model: SmsCampaign },
  { key: "paymentAttempts", model: PaymentAttempt },
  // PaymentGateway is left out on purpose: backups never carry payment gateway secrets.
  { key: "refunds", model: Refund },
];

/** What each backed-up collection holds, in words the Backup page shows next to its count. */
const COLLECTION_LABELS: Record<string, string> = {
  categories: "Menu categories",
  subcategories: "Menu subcategories",
  foodItems: "Dishes",
  tables: "Tables",
  chefs: "Chef logins",
  team: "Team members (website)",
  awards: "Awards (website)",
  coupons: "Coupons",
  couponRedemptions: "Coupon uses",
  reviews: "Restaurant reviews",
  orders: "Orders and bills",
  orderItems: "Order items",
  chatMessages: "Guest chat messages",
  invoiceCounters: "Invoice number counters",
  shifts: "Cash shifts",
  dayCloses: "Day-close reports",
  stations: "Kitchen stations",
  displays: "Display slideshows",
  printers: "Printers",
  stockItems: "Stock items",
  recipes: "Recipes",
  stockMovements: "Stock movements",
  vendors: "Vendors",
  purchases: "Purchases",
  stockCounts: "Stock counts",
  customers: "Customers",
  loyaltyEntries: "Loyalty points",
  bookings: "Table bookings",
  foodReviews: "Dish reviews",
  landingContent: "Landing page content",
  creditEntries: "Pay-later ledger",
  promoBanners: "Promo banners",
  smsTemplates: "SMS templates",
  smsCampaigns: "SMS campaigns",
  paymentAttempts: "Online payment attempts",
  refunds: "Refunds",
};

export interface CollectionInfo {
  key: string;
  label: string;
  count: number;
}

export async function describeCollections(restaurantId: Types.ObjectId | string): Promise<CollectionInfo[]> {
  return Promise.all(
    TENANT_MODELS.map(async ({ key, model }) => ({
      key,
      label: COLLECTION_LABELS[key] ?? key,
      count: await model.countDocuments({ restaurantId }),
    }))
  );
}

/**
 * Deletes everything in the chosen collections for this restaurant. Order items always go with their orders (an item
 * without its order is junk), and the invoice counters only with the orders, because restarting them while old bills
 * exist would reuse invoice numbers. Returns how many documents were removed per collection.
 */
export async function resetCollections(
  restaurantId: Types.ObjectId | string,
  keys: string[]
): Promise<Record<string, number>> {
  const known = new Set(TENANT_MODELS.map((m) => m.key));
  const chosen = new Set(keys);
  if (chosen.size === 0) throw new HttpError(400, "Choose at least one collection to reset");
  for (const key of chosen) {
    if (!known.has(key)) throw new HttpError(400, `Unknown collection: ${key}`);
  }
  if (chosen.has("orders") !== chosen.has("orderItems")) {
    throw new HttpError(400, "Orders and order items must be reset together");
  }
  if (chosen.has("invoiceCounters") && !chosen.has("orders")) {
    throw new HttpError(400, "Invoice number counters can only be reset together with the orders, or numbers would repeat");
  }

  const removed: Record<string, number> = {};
  for (const { key, model } of TENANT_MODELS) {
    if (!chosen.has(key)) continue;
    removed[key] = (await model.deleteMany({ restaurantId })).deletedCount ?? 0;
  }
  // With the orders gone, no table should still look seated or waiting to pay.
  if (chosen.has("orders") && !chosen.has("tables")) {
    await TableModel.updateMany(
      { restaurantId },
      { $set: { status: "available", sessionId: null, occupiedAt: null } }
    );
  }
  return removed;
}

async function buildBackupPayload(restaurantId: Types.ObjectId | string) {
  const restaurant = await Restaurant.findById(restaurantId).lean();
  if (!restaurant) throw new HttpError(404, "Restaurant not found");

  const backup: Record<string, unknown> = {
    meta: {
      exportedAt: new Date().toISOString(),
      restaurantKey: restaurant.key,
      restaurantName: restaurant.name,
      version: 1,
    },
    restaurant,
  };
  for (const { key, model } of TENANT_MODELS) {
    backup[key] = await model.find({ restaurantId }).lean();
  }
  return { restaurant, backup };
}

export function isBackupStorageAvailable(): boolean {
  const r2 = getR2();
  if (r2?.privateBucket) return true;
  // Vercel sets VERCEL=1; its filesystem is read-only outside /tmp.
  return process.env.VERCEL !== "1";
}

export async function buildBackupJson(
  restaurantId: Types.ObjectId | string
): Promise<{ filename: string; json: string }> {
  const { restaurant, backup } = await buildBackupPayload(restaurantId);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return { filename: `backup-${restaurant.key}-${timestamp}.json`, json: JSON.stringify(backup, null, 2) };
}

export async function pruneOldBackups(restaurantId: Types.ObjectId | string): Promise<void> {
  const stale = await BackupRecord.find({ restaurantId }).sort({ createdAt: -1 }).skip(RETENTION_LIMIT);
  for (const record of stale) {
    await deleteBackupFile(record);
    await BackupRecord.deleteOne({ _id: record._id });
  }
}

export async function generateBackupFile(
  restaurantId: Types.ObjectId | string,
  trigger: BackupTrigger
): Promise<{ record: IBackupRecord; json: string }> {
  const { restaurant, backup } = await buildBackupPayload(restaurantId);
  const json = JSON.stringify(backup, null, 2);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `backup-${restaurant.key}-${timestamp}.json`;
  const storedAs = `${restaurantId}/${filename}`;
  await putObject("backups", storedAs, Buffer.from(json, "utf-8"), "application/json");

  const record = await BackupRecord.create({
    restaurantId,
    filename,
    storedAs,
    sizeBytes: Buffer.byteLength(json),
    trigger,
  });

  await pruneOldBackups(restaurantId);

  return { record, json };
}

export async function readBackupFile(record: Pick<IBackupRecord, "restaurantId" | "storedAs">): Promise<string> {
  return (await getObject("backups", record.storedAs)).toString("utf-8");
}

export async function deleteBackupFile(record: Pick<IBackupRecord, "restaurantId" | "storedAs">): Promise<void> {
  await deleteObject("backups", record.storedAs);
}

export async function applyBackupPayload(restaurantId: Types.ObjectId | string, backup: Record<string, unknown>) {
  if (!backup || typeof backup !== "object" || Array.isArray(backup)) {
    throw new HttpError(400, "Backup data must be a JSON object");
  }
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) throw new HttpError(404, "Restaurant not found");

  if (backup.restaurant && typeof backup.restaurant === "object") {
    const {
      _id,
      key,
      restaurantId: _rid,
      createdAt,
      updatedAt,
      __v,
      ...fields
    } = backup.restaurant as Record<string, unknown>;
    Object.assign(restaurant, fields);
    await restaurant.save();
  }

  const summary: Record<string, number> = {};
  for (const { key, model } of TENANT_MODELS) {
    const docs = backup[key];
    if (!Array.isArray(docs)) {
      summary[key] = 0;
      continue;
    }

    await model.deleteMany({ restaurantId });

    const ops = docs
      .filter((doc) => doc && typeof doc === "object" && doc._id)
      .map((doc) => ({ insertOne: { document: { ...(doc as Record<string, unknown>), restaurantId } } }));
    if (ops.length > 0) {
      await model.bulkWrite(ops, { ordered: false });
    }
    summary[key] = ops.length;
  }
  return summary;
}
