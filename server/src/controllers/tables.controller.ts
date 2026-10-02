import { Request, Response } from "express";
import { Types } from "mongoose";

import { asyncHandler } from "../middleware/errorHandler";
import Admin from "../models/Admin";
import Order from "../models/Order";
import TableModel from "../models/Table";
import { HttpError } from "../utils/httpError";
import { hashPassword } from "../utils/password";
import { cancelUnsentOrdersForTables } from "../utils/tableRelease";
import { syncTableState } from "../utils/tableState";
import { encryptTableToken } from "../utils/tableToken";

function validId(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(400, "Invalid id");
}

export const listTables = asyncHandler(async (req: Request, res: Response) => {
  const tables = await TableModel.find({ restaurantId: req.restaurantId }).select("-passwordHash").sort({ code: 1 });
  const withTokens = tables.map((table) => ({
    ...table.toObject(),
    qrToken: encryptTableToken(table._id.toString(), req.restaurantId!),
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
  if (code !== undefined) update.code = code;
  if (isGuest !== undefined) update.isGuest = !!isGuest;
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
