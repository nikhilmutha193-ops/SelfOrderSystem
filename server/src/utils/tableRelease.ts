import { Types } from "mongoose";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";

/**
 * Cancels guest-placed open orders on the given tables whose items never reached
 * the kitchen. Two kinds are deliberately spared:
 * - anything with a printed KOT, since that food was cooked and still has to be settled;
 * - counter orders, which staff raised (and usually took payment for) at the till, so
 *   they run through the kitchen regardless of who is sitting at the table.
 * Returns how many orders were cancelled.
 */
export async function cancelUnsentOrdersForTables(tableIds: Types.ObjectId[]): Promise<number> {
  if (tableIds.length === 0) return 0;

  const open = await Order.find({ tableId: { $in: tableIds }, status: "open", source: { $ne: "counter" } }).select("_id");
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
