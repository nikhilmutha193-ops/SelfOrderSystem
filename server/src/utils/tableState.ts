import { Types } from "mongoose";

import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import TableModel, { TableStatus } from "../models/Table";
import { restaurantPaysUpfront } from "./dineInPayment";

/**
 * Leaves a table's unpaid bills to be settled at the counter: they keep their table for reference but stop
 * holding it, so it can be released for the next guests. Orders with nothing on them are left alone.
 * Returns how many bills were detached.
 */
export async function detachUnpaidOrders(tableId: Types.ObjectId | string): Promise<number> {
  const open = await Order.find({
    tableId,
    status: { $in: ["open", "billed"] },
    payAtCounter: { $ne: true },
  }).select("_id");
  if (open.length === 0) return 0;
  const withDishes = await OrderItem.find({ orderId: { $in: open.map((o) => o._id) }, status: { $ne: "cancelled" } }).distinct(
    "orderId"
  );
  if (withDishes.length === 0) return 0;
  await Order.updateMany({ _id: { $in: withDishes } }, { $set: { payAtCounter: true, payAtCounterAt: new Date() } });
  return withDishes.length;
}

export async function syncTableState(
  tableId: Types.ObjectId | string,
  options: { endSession?: boolean } = {}
): Promise<TableStatus | null> {
  const table = await TableModel.findById(tableId);
  if (!table) return null;
  if (table.isGuest) return table.status;

  // Bills the guest left to pay at the counter no longer hold the table (see detachUnpaidOrders).
  const unpaid = await Order.find({
    tableId: table._id,
    status: { $in: ["open", "billed"] },
    payAtCounter: { $ne: true },
  }).select("status");

  if (unpaid.length === 0) {
    // Guests who pay when ordering are still eating after they pay, so the table stays seated
    // until staff (or auto-release) end the session.
    if (!options.endSession && table.status !== "available" && (await restaurantPaysUpfront(table.restaurantId))) {
      if (table.status !== "occupied") await TableModel.updateOne({ _id: table._id }, { $set: { status: "occupied" } });
      return "occupied";
    }
    await TableModel.updateOne(
      { _id: table._id },
      { $set: { status: "available" }, $unset: { sessionId: "", occupiedAt: "" } }
    );
    return "available";
  }

  const status: TableStatus =
    options.endSession || unpaid.every((o) => o.status === "billed") ? "awaiting_payment" : "occupied";
  await TableModel.updateOne(
    { _id: table._id },
    {
      $set: { status, ...(!table.occupiedAt && { occupiedAt: new Date() }) },
      ...(options.endSession && { $unset: { sessionId: "" } }),
    }
  );
  return status;
}
