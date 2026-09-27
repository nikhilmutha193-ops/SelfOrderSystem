import { Types } from "mongoose";

import Order from "../models/Order";
import TableModel, { TableStatus } from "../models/Table";

export async function syncTableState(
  tableId: Types.ObjectId | string,
  options: { endSession?: boolean } = {}
): Promise<TableStatus | null> {
  const table = await TableModel.findById(tableId);
  if (!table) return null;
  if (table.isGuest) return table.status;

  const unpaid = await Order.find({ tableId: table._id, status: { $in: ["open", "billed"] } }).select("status");

  if (unpaid.length === 0) {
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
