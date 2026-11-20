import { Request, Response } from "express";

import { clearMaintenanceCache, isMaintenanceActive, loadMaintenance } from "../middleware/maintenance";
import { asyncHandler } from "../middleware/errorHandler";
import Restaurant from "../models/Restaurant";
import { writeAudit } from "../utils/audit";
import { HttpError } from "../utils/httpError";

function assertOwner(req: Request) {
  if (!req.admin?.isOwner) throw new HttpError(403, "Only the owner account can manage maintenance mode");
}

function dateOrNull(value: unknown, label: string): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value as string);
  if (typeof value !== "string" || Number.isNaN(date.getTime())) throw new HttpError(400, `${label} is not a valid date and time`);
  return date;
}

/** Public: what the maintenance page needs, and whether it is showing right now. */
export const getMaintenanceStatus = asyncHandler(async (req: Request, res: Response) => {
  const { maintenance, name, logoUrl } = await loadMaintenance(req.restaurantId!);
  const now = new Date();
  res.setHeader("Cache-Control", "no-store");
  res.json({
    active: isMaintenanceActive(maintenance, now),
    title: maintenance.title,
    message: maintenance.message,
    imageUrl: maintenance.imageUrl,
    startAt: maintenance.startAt ?? null,
    endAt: maintenance.endAt ?? null,
    restaurantName: name,
    logoUrl,
    now: now.toISOString(),
  });
});

export const getMaintenanceSettings = asyncHandler(async (req: Request, res: Response) => {
  assertOwner(req);
  const restaurant = await Restaurant.findById(req.restaurantId).select("maintenance").lean();
  const m = restaurant?.maintenance;
  res.json({
    enabled: m?.enabled ?? false,
    startAt: m?.startAt ?? null,
    endAt: m?.endAt ?? null,
    title: m?.title ?? "",
    message: m?.message ?? "",
    imageUrl: m?.imageUrl ?? "",
    active: isMaintenanceActive(m),
  });
});

export const updateMaintenanceSettings = asyncHandler(async (req: Request, res: Response) => {
  assertOwner(req);
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (typeof body.enabled !== "boolean") throw new HttpError(400, "enabled must be true or false");
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!title) throw new HttpError(400, "Enter a title for the maintenance page");
  if (title.length > 100) throw new HttpError(400, "The title can be at most 100 characters");
  if (message.length > 1000) throw new HttpError(400, "The message can be at most 1000 characters");

  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
  if (imageUrl && !imageUrl.startsWith("/uploads/") && !/^https:\/\//i.test(imageUrl)) {
    throw new HttpError(400, "The image must be an uploaded picture or an https link");
  }

  const startAt = dateOrNull(body.startAt, "The start time");
  const endAt = dateOrNull(body.endAt, "The end time");
  if (startAt && endAt && endAt <= startAt) throw new HttpError(400, "The end time must be after the start time");

  const restaurant = await Restaurant.findByIdAndUpdate(
    req.restaurantId,
    { $set: { maintenance: { enabled: body.enabled, startAt, endAt, title, message, imageUrl } } },
    { new: true }
  );
  if (!restaurant) throw new HttpError(404, "Restaurant not found");
  clearMaintenanceCache();
  await writeAudit(
    req,
    "maintenance.update",
    body.enabled
      ? `Maintenance mode on${startAt ? ` from ${startAt.toISOString()}` : ""}${endAt ? ` until ${endAt.toISOString()}` : ""}`
      : "Maintenance mode off"
  );
  res.json({ ...restaurant.maintenance, active: isMaintenanceActive(restaurant.maintenance) });
});
