import { Request, Response } from "express";
import { Types } from "mongoose";

import { asyncHandler } from "../middleware/errorHandler";
import Admin from "../models/Admin";
import Order from "../models/Order";
import Restaurant from "../models/Restaurant";
import TableModel from "../models/Table";
import { writeAudit } from "../utils/audit";
import { restaurantIsCafe } from "../utils/dineInPayment";
import { HttpError } from "../utils/httpError";
import { hashPassword } from "../utils/password";
import { cancelUnsentOrdersForTables } from "../utils/tableRelease";
import { allowedTableStatuses } from "../utils/tableStatus";
import { syncTableState } from "../utils/tableState";
import { encryptTableToken } from "../utils/tableToken";

function validId(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(400, "Invalid id");
}

export const listTables = asyncHandler(async (req: Request, res: Response) => {
  const tables = await TableModel.find({ restaurantId: req.restaurantId }).select("-passwordHash").sort({ code: 1 });
  const unpaid = await unpaidOrdersByTable(req.restaurantId!);
  const cafe = await restaurantIsCafe(req.restaurantId!);
  const withTokens = tables.map((table) => ({
    ...table.toObject(),
    qrToken: encryptTableToken(table._id.toString(), req.restaurantId!),
    allowedStatuses: allowedTableStatuses(table, unpaid.get(table._id.toString()) ?? 0, { cafe }),
  }));
  res.json(withTokens);
});

export const listCaptains = asyncHandler(async (req: Request, res: Response) => {
  const admins = await Admin.find({ restaurantId: req.restaurantId })
    .select("username isOwner permissions")
    .sort({ username: 1 });
  res.json(
    admins
      .filter((admin) => admin.isOwner || admin.permissions?.get("orders") === "edit")
      .map((admin) => ({ _id: admin._id, username: admin.username }))
  );
});

export const setTableCaptain = asyncHandler(async (req: Request, res: Response) => {
  if (!Types.ObjectId.isValid(req.params.id)) throw new HttpError(400, "Invalid id");
  const { captainId } = req.body as { captainId?: unknown };
  let captain: Types.ObjectId | null = null;
  if (captainId !== null && captainId !== undefined && captainId !== "") {
    if (typeof captainId !== "string" || !Types.ObjectId.isValid(captainId))
      throw new HttpError(400, "Choose a staff member");
    const admin = await Admin.findOne({ _id: captainId, restaurantId: req.restaurantId }).select("_id");
    if (!admin) throw new HttpError(404, "Staff member not found");
    captain = admin._id;
  }
  const table = await TableModel.findOneAndUpdate(
    { _id: req.params.id, restaurantId: req.restaurantId },
    { $set: { captainId: captain } },
    { new: true }
  ).select("-passwordHash");
  if (!table) throw new HttpError(404, "Table not found");
  res.json(table);
});

export const getTableLoginSettings = asyncHandler(async (req: Request, res: Response) => {
  const restaurant = await Restaurant.findById(req.restaurantId).select("tableLoginSettings");
  if (!restaurant) throw new HttpError(404, "Restaurant not found");
  res.json(restaurant.tableLoginSettings);
});

export const updateTableLoginSettings = asyncHandler(async (req: Request, res: Response) => {
  const { allowQrScan, showOrderNow, allowQrLogin, allowPinLogin, allowTokenLogin, qr, manual, requiredDetails } =
    req.body as {
    allowQrScan?: boolean;
    showOrderNow?: boolean;
    allowQrLogin?: boolean;
    allowPinLogin?: boolean;
    allowTokenLogin?: boolean;
    requiredDetails?: Partial<Record<"name" | "phone" | "members" | "birthday", boolean>>;
    qr?: Partial<Record<"placeOrder" | "showMenu" | "showFeedback" | "showRateUs", boolean>>;
    manual?: Partial<Record<"placeOrder" | "showMenu" | "showFeedback" | "showRateUs", boolean>>;
  };
  const restaurant = await Restaurant.findById(req.restaurantId);
  if (!restaurant) throw new HttpError(404, "Restaurant not found");
  const settings = restaurant.tableLoginSettings;
  if (allowQrScan !== undefined) settings.allowQrScan = !!allowQrScan;
  if (showOrderNow !== undefined) settings.showOrderNow = !!showOrderNow;
  if (allowQrLogin !== undefined) settings.allowQrLogin = !!allowQrLogin;
  if (allowPinLogin !== undefined) settings.allowPinLogin = !!allowPinLogin;
  if (allowTokenLogin !== undefined) settings.allowTokenLogin = !!allowTokenLogin;
  for (const field of ["name", "phone", "members", "birthday"] as const) {
    if (requiredDetails?.[field] !== undefined) settings.requiredDetails[field] = !!requiredDetails[field];
  }
  for (const [key, patch] of [["qr", qr], ["manual", manual]] as const) {
    if (!patch) continue;
    for (const field of ["placeOrder", "showMenu", "showFeedback", "showRateUs"] as const) {
      if (patch[field] !== undefined) settings[key][field] = !!patch[field];
    }
    // Guests can't order from a menu they can't see.
    if (!settings[key].showMenu) settings[key].placeOrder = false;
  }
  await restaurant.save();
  res.json(restaurant.tableLoginSettings);
});

export const listAvailableTables = asyncHandler(async (req: Request, res: Response) => {
  // Guest/counter tables are shared walk-in tables, always open for anyone to log into - they
  // don't belong in the "pick your table" list on the public sign-in page, which is meant to
  // help a guest find their own assigned, PIN-gated table.
  const tables = await TableModel.find({ restaurantId: req.restaurantId, status: "available", isGuest: { $ne: true } })
    .select("code")
    .sort({ code: 1 });
  res.json(tables);
});

export const createTable = asyncHandler(async (req: Request, res: Response) => {
  const { code, password, isGuest } = req.body as { code?: string; password?: string; isGuest?: boolean };
  if (!code || !password) throw new HttpError(400, "code and password are required");

  const existing = await TableModel.findOne({ restaurantId: req.restaurantId, code });
  if (existing) throw new HttpError(409, "A table with that code already exists");

  const passwordHash = await hashPassword(password);
  const table = await TableModel.create({
    restaurantId: req.restaurantId,
    code,
    passwordHash,
    password,
    status: "available",
    isGuest: !!isGuest,
  });
  res.status(201).json({
    id: table._id,
    code: table.code,
    password: table.password,
    status: table.status,
    isGuest: table.isGuest,
  });
});

export const updateTable = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.id);
  const { code, password, isGuest, autoReleaseMinutes } = req.body as {
    code?: string;
    password?: string;
    isGuest?: boolean;
    autoReleaseMinutes?: number | null;
  };
  const update: Record<string, unknown> = {};
  if (code !== undefined) {
    const trimmed = typeof code === "string" ? code.trim() : "";
    if (!trimmed) throw new HttpError(400, "Table code can't be empty");
    const clash = await TableModel.exists({
      restaurantId: req.restaurantId,
      code: trimmed,
      _id: { $ne: req.params.id },
    });
    if (clash) throw new HttpError(409, "A table with that code already exists");
    update.code = trimmed;
  }
  if (isGuest !== undefined) {
    const current = await TableModel.findOne({ _id: req.params.id, restaurantId: req.restaurantId });
    if (!current) throw new HttpError(404, "Table not found");
    if (!!isGuest !== !!current.isGuest) {
      // A table can only switch kind while nothing is running on it, or guests and bills would be stranded.
      const running = await Order.exists({
        restaurantId: req.restaurantId,
        tableId: current._id,
        status: { $in: ["open", "billed"] },
      });
      if (running || (!current.isGuest && current.status !== "available")) {
        throw new HttpError(409, `Table ${current.code} has a running order or a seated guest. Settle or release it first.`);
      }
      update.isGuest = !!isGuest;
      // Guest tables are shared, so they have no captain or area.
      if (isGuest) Object.assign(update, { captainId: null, areaId: null, status: "available" });
    }
  }
  if (autoReleaseMinutes !== undefined) {
    // null clears the override so the table falls back to the restaurant default.
    if (autoReleaseMinutes !== null && (typeof autoReleaseMinutes !== "number" || autoReleaseMinutes < 0)) {
      throw new HttpError(400, "autoReleaseMinutes must be a non-negative number or null");
    }
    update.autoReleaseMinutes = autoReleaseMinutes;
  }
  if (password) {
    update.passwordHash = await hashPassword(password);
    update.password = password;
  }

  const table = await TableModel.findOneAndUpdate(
    { _id: req.params.id, restaurantId: req.restaurantId },
    { $set: update },
    { new: true }
  ).select("-passwordHash");
  if (!table) throw new HttpError(404, "Table not found");
  res.json(table);
});

export const releaseTable = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.id);
  const existing = await TableModel.findOne({ _id: req.params.id, restaurantId: req.restaurantId });
  if (!existing) throw new HttpError(404, "Table not found");

  const cancelledOrders = await cancelUnsentOrdersForTables([existing._id]);
  const status = await syncTableState(existing._id, { endSession: true });
  const table = await TableModel.findById(existing._id).select("-passwordHash");

  res.json({ ...table!.toObject(), cancelledOrders, awaitingPayment: status === "awaiting_payment" });
});

/** How many unpaid (open or billed) orders each table has, by table id. */
async function unpaidOrdersByTable(restaurantId: string): Promise<Map<string, number>> {
  const rows = await Order.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { restaurantId: new Types.ObjectId(restaurantId), status: { $in: ["open", "billed"] }, tableId: { $ne: null } } },
    { $group: { _id: "$tableId", count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [row._id.toString(), row.count]));
}

const STATUS_LABELS: Record<string, string> = { available: "Free", occupied: "Seated", awaiting_payment: "Waiting to pay" };

/** Staff change a table's status by hand, but only to a status the table's orders allow. */
export const setTableStatus = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.id);
  const { status } = req.body as { status?: unknown };
  const target = String(status ?? "");
  const table = await TableModel.findOne({ _id: req.params.id, restaurantId: req.restaurantId });
  if (!table) throw new HttpError(404, "Table not found");

  const unpaid = (await unpaidOrdersByTable(req.restaurantId!)).get(table._id.toString()) ?? 0;
  const allowed = allowedTableStatuses(table, unpaid, { cafe: await restaurantIsCafe(req.restaurantId!) });
  if (!(allowed as string[]).includes(target)) {
    throw new HttpError(
      409,
      allowed.length
        ? `This table can't go from ${STATUS_LABELS[table.status]} to ${STATUS_LABELS[target] ?? target}. It can be set to: ${allowed.map((s) => STATUS_LABELS[s]).join(", ")}.`
        : "This table's status can't be changed by hand."
    );
  }

  let cancelledOrders = 0;
  if (target === "available") {
    // Same as releasing it: unsent orders are cancelled, and cooked unpaid food keeps it Waiting to pay.
    cancelledOrders = await cancelUnsentOrdersForTables([table._id]);
    await syncTableState(table._id, { endSession: true });
  } else {
    await TableModel.updateOne(
      { _id: table._id },
      { $set: { status: target, ...(!table.occupiedAt && { occupiedAt: new Date() }) } }
    );
  }
  const updated = await TableModel.findById(table._id).select("-passwordHash");
  await writeAudit(
    req,
    "table.status",
    `Table ${table.code}: ${STATUS_LABELS[table.status]} to ${STATUS_LABELS[updated!.status]}`
  );
  res.json({ ...updated!.toObject(), cancelledOrders, awaitingPayment: updated!.status === "awaiting_payment" });
});

/** The signed-in guest's own table, so the menu can show its number before an order exists. */
export const getOwnTable = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth?.tableId) return res.json({ code: null });
  const table = await TableModel.findOne({ _id: req.auth.tableId, restaurantId: req.restaurantId }).select("code");
  res.json({ code: table?.code ?? null });
});

export const releaseOwnTableSession = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth?.tableId) throw new HttpError(400, "No table session to release");

  const table = await TableModel.findOne({
    _id: req.auth.tableId,
    restaurantId: req.restaurantId,
    sessionId: req.auth.sessionId,
  });
  if (!table) return res.json({ released: false });

  await cancelUnsentOrdersForTables([table._id]);
  const status = await syncTableState(table._id, { endSession: true });

  res.json({ released: true, awaitingPayment: status === "awaiting_payment" });
});

export const deleteTable = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.id);
  const table = await TableModel.findOne({ _id: req.params.id, restaurantId: req.restaurantId });
  if (!table) throw new HttpError(404, "Table not found");

  // Deleting a table mid-service would orphan a live order, so block it while one is open.
  const openOrders = await Order.countDocuments({ tableId: table._id, status: { $in: ["open", "billed"] } });
  if (openOrders > 0) {
    throw new HttpError(409, `This table has ${openOrders} open order(s). Close or cancel them first.`);
  }

  await TableModel.deleteOne({ _id: table._id });
  res.json({ message: "Table deleted" });
});
