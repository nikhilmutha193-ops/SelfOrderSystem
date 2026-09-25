import { Types } from "mongoose";

import Order from "../models/Order";
import OrderItem from "../models/OrderItem";

export async function cancelUnsentOrdersForTables(tableIds: Types.ObjectId[]): Promise<number> {
  if (tableIds.length === 0) return 0;

  const open = await Order.find({ tableId: { $in: tableIds }, status: "open", source: { $ne: "counter" } }).select(
    "_id"
  );
  if (open.length === 0) return 0;

  const openIds = open.map((o) => o._id);
  const sent = await OrderItem.find({ orderId: { $in: openIds }, kotRound: { $ne: null } }).distinct("orderId");
  const sentKeys = new Set(sent.map((id) => id.toString()));
  const toCancel = openIds.filter((id) => !sentKeys.has(id.toString()));
  if (toCancel.length === 0) return 0;

  await Order.updateMany({ _id: { $in: toCancel } }, { $set: { status: "cancelled" } });
  await OrderItem.updateMany({ orderId: { $in: toCancel }, status: "pending" }, { $set: { status: "cancelled" } });
  return toCancel.length;
}
