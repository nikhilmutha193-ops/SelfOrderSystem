import { Request, Response } from "express";

import { asyncHandler } from "../middleware/errorHandler";
import BackupRecord from "../models/BackupRecord";
import Restaurant from "../models/Restaurant";
import { writeAudit } from "../utils/audit";
import {
  applyBackupPayload,
  buildBackupJson,
  deleteBackupFile,
  describeCollections,
  generateBackupFile,
  isBackupStorageAvailable,
  readBackupFile,
  resetCollections,
} from "../utils/backupService";
import { backupTimes } from "../utils/backupScheduler";
import { isValidDayEndTime } from "../utils/businessDay";
import { HttpError } from "../utils/httpError";
import { assertOwnerPassword } from "../utils/ownerConfirm";

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

export const exportBackup = asyncHandler(async (req: Request, res: Response) => {
  const { filename, json } = await buildBackupJson(req.restaurantId!);
  sendAsAttachment(res, filename, json);
});

export const generateBackup = asyncHandler(async (req: Request, res: Response) => {
  if (!isBackupStorageAvailable()) {
    throw new HttpError(
      503,
      'Saving backups on the server isn\'t available on this host (its storage is read-only). Use "Download backup" to save the file to your device instead.'
    );
  }
  const { record } = await generateBackupFile(req.restaurantId!, "manual");
  res.status(201).json(record);
});

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

export const listCollections = asyncHandler(async (req: Request, res: Response) => {
  res.json(await describeCollections(req.restaurantId!));
});

export const resetData = asyncHandler(async (req: Request, res: Response) => {
  const { collections, password } = req.body as { collections?: unknown; password?: unknown };
  if (!Array.isArray(collections) || collections.some((c) => typeof c !== "string")) {
    throw new HttpError(400, "collections must be a list of names");
  }
  await assertOwnerPassword(req, password);

  // Keep a copy on the server first whenever the host can store one, so a mistake can be restored.
  let backupFilename: string | null = null;
  if (isBackupStorageAvailable()) {
    const { record } = await generateBackupFile(req.restaurantId!, "manual");
    backupFilename = record.filename;
  }
  const removed = await resetCollections(req.restaurantId!, collections as string[]);
  await writeAudit(
    req,
    "data.reset",
    `Reset ${Object.entries(removed)
      .map(([key, n]) => `${key} (${n})`)
      .join(", ")}${backupFilename ? `; backup ${backupFilename}` : "; no backup saved"}`
  );
  res.json({ message: "Data reset", removed, backupFilename });
});

const MAX_BACKUP_TIMES = 6;

function scheduleView(schedule: { enabled: boolean; time: string; times?: string[]; lastRunAt?: Date }) {
  const times = backupTimes(schedule);
  return { enabled: schedule.enabled, time: times[0] ?? schedule.time, times, lastRunAt: schedule.lastRunAt };
}

export const getBackupSchedule =asyncHandler(async (req: Request, res: Response) => {
  const restaurant = await Restaurant.findById(req.restaurantId);
  if (!restaurant) throw new HttpError(404, "Restaurant not found");
  res.json(scheduleView(restaurant.backupSchedule));
});

export const updateBackupSchedule = asyncHandler(async (req: Request, res: Response) => {
  const { enabled, time, times } = req.body as { enabled?: boolean; time?: string; times?: unknown };
  if (typeof enabled !== "boolean") throw new HttpError(400, "enabled must be a boolean");
  // `times` is the list; a client that only sends one `time` still works.
  const wanted = times === undefined ? [time] : times;
  if (!Array.isArray(wanted) || wanted.some((t) => typeof t !== "string" || !isValidDayEndTime(t))) {
    throw new HttpError(400, "Every backup time must be in HH:mm format");
  }
  const list = [...new Set(wanted as string[])].sort();
  if (list.length === 0) throw new HttpError(400, "Add at least one backup time");
  if (list.length > MAX_BACKUP_TIMES) throw new HttpError(400, `You can set at most ${MAX_BACKUP_TIMES} backup times a day`);

  const restaurant = await Restaurant.findById(req.restaurantId);
  if (!restaurant) throw new HttpError(404, "Restaurant not found");
  restaurant.backupSchedule.enabled = enabled;
  restaurant.backupSchedule.times = list;
  restaurant.backupSchedule.time = list[0];
  await restaurant.save();
  res.json(scheduleView(restaurant.backupSchedule));
});
