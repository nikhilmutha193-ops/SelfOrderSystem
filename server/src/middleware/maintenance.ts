import { NextFunction, Request, Response } from "express";

import Restaurant, { IMaintenance } from "../models/Restaurant";
import { verifyToken } from "../utils/jwt";

export type MaintenanceSettings = Pick<IMaintenance, "enabled" | "startAt" | "endAt" | "title" | "message" | "imageUrl">;

/** On while the switch is on and now is inside the window (no start = already started, no end = until switched off). */
export function isMaintenanceActive(m: Pick<IMaintenance, "enabled" | "startAt" | "endAt"> | undefined, now = new Date()): boolean {
  if (!m?.enabled) return false;
  if (m.startAt && now < new Date(m.startAt)) return false;
  if (m.endAt && now >= new Date(m.endAt)) return false;
  return true;
}

// Looked up at most every few seconds per restaurant, not on every request.
const CACHE_MS = 5000;
let cached: { restaurantId: string; at: number; value: { maintenance: MaintenanceSettings; name: string; logoUrl: string } } | null = null;

export function clearMaintenanceCache() {
  cached = null;
}

export async function loadMaintenance(restaurantId: string) {
  if (cached && cached.restaurantId === restaurantId && Date.now() - cached.at < CACHE_MS) return cached.value;
  const doc = await Restaurant.findById(restaurantId).select("name logoUrl maintenance").lean();
  const value = {
    maintenance: (doc?.maintenance ?? { enabled: false, title: "", message: "", imageUrl: "" }) as MaintenanceSettings,
    name: doc?.name ?? "",
    logoUrl: doc?.logoUrl ?? "",
  };
  cached = { restaurantId, at: Date.now(), value };
  return value;
}

// Always reachable: the status itself, admin sign-in and session refresh, and what machines call (payment and
// aggregator webhooks, print agents), so a maintenance window never loses a payment or a printed ticket.
const OPEN_PREFIXES = [
  "/maintenance",
  "/auth/admin",
  "/auth/refresh",
  "/restaurant/public",
  "/payments/razorpay/webhook",
  "/webhooks",
  "/aggregator",
  "/oauth",
  "/print-agent",
];

function isAdminRequest(req: Request): boolean {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return false;
  try {
    return verifyToken(header.slice(7)).role === "admin";
  } catch {
    return false;
  }
}

/** While maintenance is active only signed-in admins (admin pages, POS, captain) can use the API. */
export async function maintenanceGate(req: Request, res: Response, next: NextFunction) {
  try {
    if (OPEN_PREFIXES.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`))) return next();
    const { maintenance } = await loadMaintenance(req.restaurantId!);
    if (!isMaintenanceActive(maintenance)) return next();
    if (isAdminRequest(req)) return next();
    if (maintenance.endAt) {
      const seconds = Math.ceil((new Date(maintenance.endAt).getTime() - Date.now()) / 1000);
      if (seconds > 0) res.setHeader("Retry-After", String(seconds));
    }
    // Sent here, not thrown: the error handler would replace a 5xx message with its generic one.
    res.status(503).json({ message: "The site is under maintenance. Please try again later.", maintenance: true });
  } catch (err) {
    next(err);
  }
}
