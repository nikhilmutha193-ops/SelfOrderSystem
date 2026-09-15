import { Model, Types } from "mongoose";
import Restaurant from "../models/Restaurant";
import BackupRecord, { BackupTrigger, IBackupRecord } from "../models/BackupRecord";
import Category from "../models/Category";
import Subcategory from "../models/Subcategory";
import FoodItem from "../models/FoodItem";
import TableModel from "../models/Table";
import Chef from "../models/Chef";
import TeamMember from "../models/TeamMember";
import Award from "../models/Award";
import Coupon from "../models/Coupon";
import Review from "../models/Review";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import ChatMessage from "../models/ChatMessage";
import { HttpError } from "./httpError";
import { deleteObject, getObject, putObject } from "./objectStore";

/** How many generated backups (manual + scheduled combined) to keep on disk per restaurant. */
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
];

async function buildBackupPayload(restaurantId: Types.ObjectId | string) {
  const restaurant = await Restaurant.findById(restaurantId).lean();
  if (!restaurant) throw new HttpError(404, "Restaurant not found");

  const backup: Record<string, unknown> = {
    meta: { exportedAt: new Date().toISOString(), restaurantKey: restaurant.key, restaurantName: restaurant.name, version: 1 },
    restaurant,
  };
  for (const { key, model } of TENANT_MODELS) {
    backup[key] = await model.find({ restaurantId }).lean();
  }
  return { restaurant, backup };
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

export async function readBackupFile(
  record: Pick<IBackupRecord, "restaurantId" | "storedAs">,
): Promise<string> {
  return (await getObject("backups", record.storedAs)).toString("utf-8");
}

export async function deleteBackupFile(
  record: Pick<IBackupRecord, "restaurantId" | "storedAs">,
): Promise<void> {
  await deleteObject("backups", record.storedAs);
}

export async function applyBackupPayload(restaurantId: Types.ObjectId | string, backup: Record<string, unknown>) {
  if (!backup || typeof backup !== "object" || Array.isArray(backup)) {
    throw new HttpError(400, "Backup data must be a JSON object");
  }
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) throw new HttpError(404, "Restaurant not found");

  if (backup.restaurant && typeof backup.restaurant === "object") {
    const { _id, key, restaurantId: _rid, createdAt, updatedAt, __v, ...fields } = backup.restaurant as Record<string, unknown>;
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

    // Upserting by original _id isn't enough: fields like Table.code or Chef.username carry their
    // own unique index per restaurantId, so an incoming doc can collide with a DIFFERENT existing
    // doc (e.g. one this restaurant was freshly seeded with) that happens to share that value under
    // a different _id. Wiping this restaurant's rows first makes restore a clean point-in-time
    // replace instead, which also sidesteps the collision entirely.
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
