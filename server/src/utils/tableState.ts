import { Types } from "mongoose";

import Order from "../models/Order";
import TableModel, { TableStatus } from "../models/Table";
import { restaurantPaysUpfront } from "./dineInPayment";

export async function syncTableState(
  tableId: Types.ObjectId | string,
  options: { endSession?: boolean } = {}
): Promise<TableStatus | null> {
  const table = await TableModel.findById(tableId);
  if (!table) return null;
  if (table.isGuest) return table.status;

  const unpaid = await Order.find({ tableId: table._id, status: { $in: ["open", "billed"] } }).select("status");

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
