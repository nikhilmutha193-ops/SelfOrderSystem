import { Model, Types } from "mongoose";

import { getR2 } from "../config/r2";
import Award from "../models/Award";
import BackupRecord, { BackupTrigger, IBackupRecord } from "../models/BackupRecord";
import Category from "../models/Category";
import ChatMessage from "../models/ChatMessage";
import Chef from "../models/Chef";
import Coupon from "../models/Coupon";
import FoodItem from "../models/FoodItem";
import InvoiceCounter from "../models/InvoiceCounter";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import Restaurant from "../models/Restaurant";
import Review from "../models/Review";
import Subcategory from "../models/Subcategory";
import TableModel from "../models/Table";
import TeamMember from "../models/TeamMember";
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
  { key: "reviews", model: Review },
  { key: "orders", model: Order },
  { key: "orderItems", model: OrderItem },
  { key: "chatMessages", model: ChatMessage },
  { key: "invoiceCounters", model: InvoiceCounter },
];

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
