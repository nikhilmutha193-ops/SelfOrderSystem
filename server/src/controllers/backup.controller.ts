import { Request, Response } from "express";
import Restaurant from "../models/Restaurant";
import BackupRecord from "../models/BackupRecord";
import { asyncHandler } from "../middleware/errorHandler";
import { HttpError } from "../utils/httpError";
import { isValidDayEndTime } from "../utils/businessDay";
import {
  applyBackupPayload,
  buildBackupJson,
  deleteBackupFile,
  generateBackupFile,
  isBackupStorageAvailable,
  readBackupFile,
} from "../utils/backupService";

function sendAsAttachment(res: Response, filename: string, json: string) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(json);
}

async function findOwnRecord(restaurantId: string, id: string) {
  const record = await BackupRecord.findOne({ _id: id, restaurantId });
  if (!record) throw new HttpError(404, "Backup not found");
  return record;
}

/**
 * One-click "download a backup now". Built in memory and streamed straight to the browser,
 * so it works everywhere - including read-only serverless hosts where saving to the server
 * isn't possible.
 */
export const exportBackup = asyncHandler(async (req: Request, res: Response) => {
  const { filename, json } = await buildBackupJson(req.restaurantId!);
  sendAsAttachment(res, filename, json);
});

export const generateBackup = asyncHandler(async (req: Request, res: Response) => {
  if (!isBackupStorageAvailable()) {
    throw new HttpError(
      503,
      "Saving backups on the server isn't available on this host (its storage is read-only). Use \"Download backup\" to save the file to your device instead."
    );
  }
  const { record } = await generateBackupFile(req.restaurantId!, "manual");
  res.status(201).json(record);
});

/** Lets the client show the right controls: server-side saving vs download-only. */
export const getBackupCapabilities = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ serverStorage: isBackupStorageAvailable() });
});

export const listBackups = asyncHandler(async (req: Request, res: Response) => {
  const records = await BackupRecord.find({ restaurantId: req.restaurantId }).sort({ createdAt: -1 });
  res.json(records);
});

export const downloadBackup = asyncHandler(async (req: Request, res: Response) => {
  const record = await findOwnRecord(req.restaurantId!, req.params.id);
  const json = await readBackupFile(record);
  sendAsAttachment(res, record.filename, json);
});

export const deleteBackup = asyncHandler(async (req: Request, res: Response) => {
  const record = await findOwnRecord(req.restaurantId!, req.params.id);
  await deleteBackupFile(record);
  await BackupRecord.deleteOne({ _id: record._id });
  res.json({ message: "Backup deleted" });
});

export const restoreFromRecord = asyncHandler(async (req: Request, res: Response) => {
  const record = await findOwnRecord(req.restaurantId!, req.params.id);
  const json = await readBackupFile(record);
  const summary = await applyBackupPayload(req.restaurantId!, JSON.parse(json));
  res.json({ message: "Restore complete", summary });
});

export const importBackup = asyncHandler(async (req: Request, res: Response) => {
  const summary = await applyBackupPayload(req.restaurantId!, req.body as Record<string, unknown>);
  res.json({ message: "Restore complete", summary });
});

export const getBackupSchedule = asyncHandler(async (req: Request, res: Response) => {
  const restaurant = await Restaurant.findById(req.restaurantId);
  if (!restaurant) throw new HttpError(404, "Restaurant not found");
  res.json(restaurant.backupSchedule);
});

export const updateBackupSchedule = asyncHandler(async (req: Request, res: Response) => {
  const { enabled, time } = req.body as { enabled?: boolean; time?: string };
  if (typeof enabled !== "boolean") throw new HttpError(400, "enabled must be a boolean");
  if (typeof time !== "string" || !isValidDayEndTime(time)) throw new HttpError(400, "time must be in HH:mm format");

  const restaurant = await Restaurant.findById(req.restaurantId);
  if (!restaurant) throw new HttpError(404, "Restaurant not found");
  restaurant.backupSchedule.enabled = enabled;
  restaurant.backupSchedule.time = time;
  await restaurant.save();
  res.json(restaurant.backupSchedule);
});
