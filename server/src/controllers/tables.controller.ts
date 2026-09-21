import { Request, Response } from "express";
import { Types } from "mongoose";
import TableModel from "../models/Table";
import Order from "../models/Order";
import { asyncHandler } from "../middleware/errorHandler";
import { HttpError } from "../utils/httpError";
import { hashPassword } from "../utils/password";
import { encryptTableToken } from "../utils/tableToken";
import { cancelUnsentOrdersForTables } from "../utils/tableRelease";

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

export const listAvailableTables = asyncHandler(async (req: Request, res: Response) => {
  const tables = await TableModel.find({ restaurantId: req.restaurantId, status: "available" })
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
  const table = await TableModel.findOneAndUpdate(
    { _id: req.params.id, restaurantId: req.restaurantId },
    // Clearing the session id invalidates the guest's token immediately - without
    // it their JWT stays valid and they can keep ordering after being released.
    { $set: { status: "available" }, $unset: { sessionId: "", occupiedAt: "" } },
    { new: true }
  ).select("-passwordHash");
  if (!table) throw new HttpError(404, "Table not found");

  // Anything the guest queued but never sent to the kitchen dies with the seating,
  // so a walked-away table doesn't leave a phantom open order behind.
  const cancelledOrders = await cancelUnsentOrdersForTables([table._id]);

  res.json({ ...table.toObject(), cancelledOrders });
});

/**
 * Lets a guest end their own table session - either before starting an order (tapping
 * "Change"/"Back" on the visitor-details step) or mid-order (tapping "Leave table" on the
 * menu, after confirming past the active-order warning if there was one). Without this, the
 * table stays marked occupied server-side even though the guest has left, blocking that table
 * for everyone else until an admin releases it by hand or the auto-release timer eventually
 * fires. Behaves exactly like an admin releasing the table: anything not yet sent to the
 * kitchen is cancelled with the seating; anything already fired stays open for staff to settle.
 */
export const releaseOwnTableSession = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth?.tableId) throw new HttpError(400, "No table session to release");

  const table = await TableModel.findOneAndUpdate(
    {
      _id: req.auth.tableId,
      restaurantId: req.restaurantId,
      // Only release the exact seating this token was issued for - a stale token from a
      // seating that already ended (or was already released) must not touch the next guest's.
      sessionId: req.auth.sessionId,
    },
    { $set: { status: "available" }, $unset: { sessionId: "", occupiedAt: "" } },
    { new: true }
  );
  // A guest table (isGuest) is never marked occupied and has no sessionId to match, so a
  // missing match there is normal, not an error - nothing to release.
  if (table) await cancelUnsentOrdersForTables([table._id]);

  res.json({ released: !!table });
});

export const deleteTable = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.id);
  const table = await TableModel.findOne({ _id: req.params.id, restaurantId: req.restaurantId });
  if (!table) throw new HttpError(404, "Table not found");

  // Deleting a table mid-service would orphan a live order, so block it while one is open.
  const openOrders = await Order.countDocuments({ tableId: table._id, status: "open" });
  if (openOrders > 0) {
    throw new HttpError(409, `This table has ${openOrders} open order(s). Close or cancel them first.`);
  }

  await TableModel.deleteOne({ _id: table._id });
  res.json({ message: "Table deleted" });
});
