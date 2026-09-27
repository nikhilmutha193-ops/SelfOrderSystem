import { RequestContext } from "../../core/context";
import { writeAudit } from "../../utils/audit";
import { HttpError } from "../../utils/httpError";
import { round2 } from "../../utils/invoice";
import { syncTableState } from "../../utils/tableState";
import { getOwnedOrder } from "./orders.access";
import { refreshCouponDiscount } from "./orders.billing";
import { OrdersRepository } from "./orders.repository";
import { ManualDiscountInput, SplitInput } from "./orders.schema";

function requireOpen(status: string, action: string) {
  if (status !== "open") throw new HttpError(409, `Only an open order can be ${action}. Reopen the bill first.`);
}

function label(order: { customerName: string; invoiceNumber?: string }) {
  return order.invoiceNumber ?? order.customerName;
}

export async function splitOrder(ctx: RequestContext, orderId: string, input: SplitInput) {
  const order = await getOwnedOrder(ctx, orderId);
  requireOpen(order.status, "split");

  const repo = new OrdersRepository(ctx.restaurantId);
  const active = (await repo.findItems(order._id)).filter((i) => i.status !== "cancelled");
  const wanted = new Set(input.itemIds);
  const moving = active.filter((i) => wanted.has(i._id.toString()));
  if (moving.length !== wanted.size) throw new HttpError(400, "Some of those items aren't on this order");
  if (moving.length === active.length) throw new HttpError(400, "Leave at least one item on the original bill");

  const created = await repo.createOrder({
    orderType: order.orderType,
    tableId: order.tableId,
    deliveryProvider: order.deliveryProvider,
    source: order.source,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    members: 1,
    status: "open",
    splitFrom: order._id,
    estimatedReadyAt: order.estimatedReadyAt,
  });
  await repo.moveItems(
    moving.map((i) => i._id),
    created._id
  );
  await refreshCouponDiscount(repo, order);

  await writeAudit(ctx, "order.split", `Moved ${moving.length} item(s) from ${label(order)} to a new bill`);
  return { order, created };
}

export async function mergeOrders(ctx: RequestContext, orderId: string, intoOrderId: string) {
  if (orderId === intoOrderId) throw new HttpError(400, "Choose a different order to merge into");
  const source = await getOwnedOrder(ctx, orderId);
  const repo = new OrdersRepository(ctx.restaurantId);
  const target = await repo.findOrder(intoOrderId);
  if (!target) throw new HttpError(404, "The order to merge into was not found");
  requireOpen(source.status, "merged");
  requireOpen(target.status, "merged into");

  await repo.moveAllItems(source._id, target._id);
  source.set({
    status: "cancelled",
    cancelReason: `Merged into ${label(target)}`,
    mergedInto: target._id,
    couponCode: undefined,
    discountAmount: 0,
    manualDiscount: null,
  });
  await repo.saveOrder(source);

  if (source.estimatedReadyAt && (!target.estimatedReadyAt || source.estimatedReadyAt > target.estimatedReadyAt)) {
    target.estimatedReadyAt = source.estimatedReadyAt;
    await repo.saveOrder(target);
  }
  await refreshCouponDiscount(repo, target);
  if (source.tableId) await syncTableState(source.tableId);

  await writeAudit(ctx, "order.merge", `Merged ${label(source)} into ${label(target)}`);
  return target;
}

export async function transferOrder(ctx: RequestContext, orderId: string, tableId: string) {
  const order = await getOwnedOrder(ctx, orderId);
  if (order.orderType !== "dine-in") throw new HttpError(400, "Only dine-in orders can move tables");
  if (order.status !== "open" && order.status !== "billed") {
    throw new HttpError(409, "Only an unpaid order can move tables");
  }

  const repo = new OrdersRepository(ctx.restaurantId);
  const table = await repo.findTable(tableId);
  if (!table) throw new HttpError(404, "Table not found");
  if (order.tableId?.equals(table._id)) throw new HttpError(400, "The order is already at this table");
  if (!table.isGuest && table.status !== "available") throw new HttpError(409, `Table ${table.code} is not free`);

  const previousTableId = order.tableId;
  order.set({ tableId: table._id, sessionId: undefined });
  await repo.saveOrder(order);
  await syncTableState(table._id);
  if (previousTableId) await syncTableState(previousTableId);

  await writeAudit(ctx, "order.transfer", `Moved ${label(order)} to table ${table.code}`);
  return order;
}

export async function setManualDiscount(ctx: RequestContext, orderId: string, input: ManualDiscountInput) {
  const order = await getOwnedOrder(ctx, orderId);
  requireOpen(order.status, "discounted");
  if (input.type === "percent" && input.value > 100)
    throw new HttpError(400, "A percentage discount can't exceed 100%");

  const repo = new OrdersRepository(ctx.restaurantId);
  const items = await repo.findItems(order._id);
  const base = round2(
    items.filter((i) => i.status !== "cancelled").reduce((sum, i) => sum + i.total, 0) - order.discountAmount
  );
  if (base <= 0) throw new HttpError(409, "Add items before giving a discount");
  const percent = input.type === "percent" ? input.value : (input.value / base) * 100;

  const admin = ctx.admin ?? (await repo.findAdmin(ctx.auth.id));
  const restaurant = await repo.findRestaurant("billingSettings");
  const limit = restaurant?.billingSettings?.maxStaffDiscountPercent ?? 10;
  if (!admin?.isOwner && percent > limit + 0.0001) {
    throw new HttpError(403, `Your discount limit is ${limit}%. Ask the owner to give a bigger discount.`);
  }

  order.manualDiscount = { type: input.type, value: input.value, reason: input.reason, by: ctx.auth.id };
  await repo.saveOrder(order);
  const shown = input.type === "percent" ? `${input.value}%` : `₹${input.value.toFixed(2)}`;
  await writeAudit(ctx, "order.discount", `Gave ${shown} off ${label(order)}: ${input.reason}`);
  return order;
}

export async function removeManualDiscount(ctx: RequestContext, orderId: string) {
  const order = await getOwnedOrder(ctx, orderId);
  requireOpen(order.status, "changed");
  order.manualDiscount = null;
  await new OrdersRepository(ctx.restaurantId).saveOrder(order);
  await writeAudit(ctx, "order.discount", `Removed the manual discount on ${label(order)}`);
  return order;
}

export async function setServiceCharge(ctx: RequestContext, orderId: string, waived: boolean) {
  const order = await getOwnedOrder(ctx, orderId);
  requireOpen(order.status, "changed");
  order.serviceChargeWaived = waived;
  await new OrdersRepository(ctx.restaurantId).saveOrder(order);
  await writeAudit(ctx, "order.serviceCharge", `${waived ? "Removed" : "Restored"} service charge on ${label(order)}`);
  return order;
}

export async function markComplimentary(ctx: RequestContext, itemId: string, reason: string) {
  const repo = new OrdersRepository(ctx.restaurantId);
  const item = await repo.findItem(itemId);
  if (!item || item.status === "cancelled") throw new HttpError(404, "Order item not found");
  if (item.complimentary) throw new HttpError(409, "This item is already complimentary");
  const order = await repo.findOrder(item.orderId.toString());
  if (!order) throw new HttpError(404, "Order not found");
  requireOpen(order.status, "changed");

  const value = item.total;
  const updated = await repo.markItemComplimentary(item._id, reason);
  await refreshCouponDiscount(repo, order);
  await writeAudit(
    ctx,
    "orderItem.complimentary",
    `Made "${item.foodName}" x${item.quantity} complimentary (₹${value.toFixed(2)}): ${reason}`
  );
  return updated;
}
