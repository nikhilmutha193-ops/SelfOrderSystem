import { FilterQuery, Types } from "mongoose";

import { RequestContext } from "../../core/context";
import { emit } from "../../core/events";
import { IOrder } from "../../models/Order";
import { writeAudit } from "../../utils/audit";
import { getBusinessDayRangeForDate, getBusinessDayStart } from "../../utils/businessDay";
import { computeDiscountAmount, findValidCoupon } from "../../utils/coupon";
import { HttpError } from "../../utils/httpError";
import { computeInvoiceTotals } from "../../utils/invoice";
import { signToken } from "../../utils/jwt";
import { getOwnedOrder, requireOwner } from "./orders.access";
import { refreshCouponDiscount, totalsForOrder } from "./orders.billing";
import { OrdersRepository } from "./orders.repository";
import {
  AddItemsInput,
  CancelItemInput,
  OrderFilterInput,
  StartCounterInput,
  StartDeliveryInput,
  StartDineInInput,
  StartTakeawayInput,
} from "./orders.schema";

export interface KitchenSummary {
  active: number;
  served: number;
  ready: number;
  preparing: number;
  pendingSent: number;
  pendingUnsent: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function announceCreated<T extends { _id: Types.ObjectId }>(ctx: RequestContext, order: T): Promise<T> {
  await emit("order.created", { restaurantId: ctx.restaurantId, orderId: order._id.toString() });
  return order;
}

function emptyKitchenSummary(): KitchenSummary {
  return { active: 0, served: 0, ready: 0, preparing: 0, pendingSent: 0, pendingUnsent: 0 };
}

export { getOwnedOrder };

export async function buildOrderFilter(
  repo: OrdersRepository,
  query: OrderFilterInput,
  options: { includeArchived?: boolean } = {}
): Promise<FilterQuery<IOrder>> {
  const filter: FilterQuery<IOrder> = {};
  if (query.type) filter.orderType = query.type;
  if (query.status === "unpaid") filter.status = { $in: ["open", "billed"] };
  else if (query.status) filter.status = query.status;
  if (!options.includeArchived) filter.archivedAt = null;

  if (query.today === "true") {
    const restaurant = await repo.findRestaurant("dayEndTime timezone");
    filter.checkinTime = { $gte: getBusinessDayStart(new Date(), restaurant?.dayEndTime, restaurant?.timezone) };
  } else if (query.from || query.to) {
    const restaurant = await repo.findRestaurant("dayEndTime timezone");
    const range: Record<string, Date> = {};
    if (query.from) {
      range.$gte = getBusinessDayRangeForDate(query.from, restaurant?.dayEndTime, restaurant?.timezone).start;
    }
    if (query.to) {
      range.$lt = getBusinessDayRangeForDate(query.to, restaurant?.dayEndTime, restaurant?.timezone).end;
    }
    filter.checkinTime = range;
  }
  return filter;
}

export async function startDineInOrder(ctx: RequestContext, input: StartDineInInput) {
  if (!ctx.auth.tableId) throw new HttpError(400, "No table session found");

  const repo = new OrdersRepository(ctx.restaurantId);
  const table = await repo.findTable(ctx.auth.tableId);
  if (!table) throw new HttpError(404, "Table not found");

  const sessionToken = (orderId: string) =>
    signToken({
      role: "table",
      restaurantId: ctx.restaurantId,
      id: ctx.auth.id,
      tableId: table._id.toString(),
      orderId,
      sessionId: ctx.auth.sessionId,
    });

  if (ctx.auth.sessionId && !table.isGuest) {
    const existing = await repo.findSessionOrder(table._id, ctx.auth.sessionId);
    if (existing) return { token: sessionToken(existing._id.toString()), order: existing };
  }

  const order = await repo.createOrder({
    orderType: "dine-in",
    tableId: table._id,
    sessionId: ctx.auth.sessionId,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    members: input.members,
    status: "open",
  });

  await announceCreated(ctx, order);
  return { token: sessionToken(order._id.toString()), order };
}

export async function startDeliveryOrder(ctx: RequestContext, input: StartDeliveryInput) {
  const order = await new OrdersRepository(ctx.restaurantId).createOrder({
    orderType: "delivery",
    deliveryProvider: input.provider,
    source: "counter",
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    members: input.members,
    status: "open",
  });
  return announceCreated(ctx, order);
}

export async function startTakeawayOrder(ctx: RequestContext, input: StartTakeawayInput) {
  const order = await new OrdersRepository(ctx.restaurantId).createOrder({
    orderType: "takeaway",
    source: "counter",
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    members: input.members,
    status: "open",
  });
  return announceCreated(ctx, order);
}

export async function startCounterOrder(ctx: RequestContext, input: StartCounterInput) {
  const repo = new OrdersRepository(ctx.restaurantId);

  const table = input.tableId ? await repo.findTable(input.tableId) : null;
  if (input.tableId && !table) throw new HttpError(404, "Table not found");
  if (table && !table.isGuest && table.status === "occupied" && !input.allowOccupied) {
    throw new HttpError(409, "This table is already occupied");
  }

  const order = await repo.createOrder({
    orderType: "dine-in",
    ...(table && { tableId: table._id }),
    source: "counter",
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    members: input.members,
    status: "open",
  });

  if (table && !table.isGuest) await repo.occupyTable(table._id);

  return announceCreated(ctx, order);
}

export async function addOrderItems(ctx: RequestContext, orderId: string, input: AddItemsInput) {
  const order = await getOwnedOrder(ctx, orderId);
  if (order.status !== "open") throw new HttpError(409, "This order is no longer open");

  const repo = new OrdersRepository(ctx.restaurantId);
  const requestedIds = [...new Set(input.items.map((line) => line.foodItemId))];
  const foods = await repo.findActiveFoodItems(requestedIds);
  const foodById = new Map(foods.map((food) => [food._id.toString(), food]));
  const missing = input.items.find((line) => !foodById.has(line.foodItemId));
  if (missing) throw new HttpError(404, `Food item ${missing.foodItemId} is not available`);

  const created = [];
  let longestPrepMinutes = 0;
  for (const line of input.items) {
    const food = foodById.get(line.foodItemId)!;

    const chosen: { groupName: string; label: string; priceDelta: number }[] = [];
    for (const selection of line.modifiers ?? []) {
      const group = (food.modifierGroups || []).find((g) => g.name === selection.groupName);
      const option = group?.options.find((o) => o.label === selection.label);
      if (group && option) chosen.push({ groupName: group.name, label: option.label, priceDelta: option.priceDelta });
    }
    const unitPrice = round2(food.price + chosen.reduce((sum, m) => sum + m.priceDelta, 0));

    const orderItem = await repo.createItem({
      orderId: order._id,
      foodItemId: food._id,
      foodName: food.name,
      unitPrice,
      quantity: line.quantity,
      total: round2(unitPrice * line.quantity),
      isJain: !!line.isJain,
      modifiers: chosen,
      note: line.note,
      status: "pending",
      kotRound: null,
    });
    created.push(orderItem);
    longestPrepMinutes = Math.max(longestPrepMinutes, food.prepTimeMinutes ?? 0);
  }

  const restaurant = await repo.findRestaurant("prepBufferMinutes");
  const buffer = restaurant?.prepBufferMinutes ?? 0;
  const roundReadyAt = new Date(Date.now() + (longestPrepMinutes + buffer) * 60 * 1000);
  if (!order.estimatedReadyAt || roundReadyAt > order.estimatedReadyAt) {
    order.estimatedReadyAt = roundReadyAt;
    await repo.saveOrder(order);
  }
  await refreshCouponDiscount(repo, order);

  await emit("order.itemsAdded", {
    restaurantId: ctx.restaurantId,
    orderId: order._id.toString(),
    itemIds: created.map((item) => item._id.toString()),
  });
  return created;
}

export async function cancelOrderItem(ctx: RequestContext, itemId: string, input: CancelItemInput) {
  const repo = new OrdersRepository(ctx.restaurantId);
  const item = await repo.findItem(itemId);
  if (!item || item.status === "cancelled") throw new HttpError(404, "Order item not found");

  const order = await repo.findOrder(item.orderId.toString());
  if (!order) throw new HttpError(404, "Order not found");
  if (order.status === "billed") throw new HttpError(409, "This order has been billed. Reopen the bill to change it.");
  if (order.status === "closed") throw new HttpError(409, "This bill is already paid. Void it instead.");
  if (order.status !== "open") throw new HttpError(409, "This order is no longer open");
  if (item.kotRound != null && !input.reason) {
    throw new HttpError(400, "Choose a reason to cancel an item that was already sent to the kitchen");
  }

  const cancelled = await repo.cancelItem(itemId, input.reason, input.note);
  if (!cancelled) throw new HttpError(404, "Order item not found");
  await refreshCouponDiscount(repo, order);

  const why = input.reason ? ` (${input.reason.replace(/_/g, " ")}${input.note ? `: ${input.note}` : ""})` : "";
  await writeAudit(ctx, "orderItem.cancel", `Cancelled item "${cancelled.foodName}" x${cancelled.quantity}${why}`);
  await emit("order.itemCancelled", {
    restaurantId: ctx.restaurantId,
    orderId: cancelled.orderId.toString(),
    itemId: cancelled._id.toString(),
  });
  return cancelled;
}

export async function listOrders(ctx: RequestContext, query: OrderFilterInput) {
  const repo = new OrdersRepository(ctx.restaurantId);
  const orders = await repo.findOrdersWithTable(await buildOrderFilter(repo, query));
  const items = await repo.findItemKitchenStates(orders.map((o) => o._id));

  const byOrder = new Map<string, KitchenSummary>();
  for (const item of items) {
    const key = item.orderId.toString();
    const summary = byOrder.get(key) ?? emptyKitchenSummary();
    if (item.status !== "cancelled") summary.active += 1;
    if (item.status === "served") summary.served += 1;
    else if (item.status === "ready") summary.ready += 1;
    else if (item.status === "preparing") summary.preparing += 1;
    else if (item.status === "pending") {
      if (item.kotRound != null) summary.pendingSent += 1;
      else summary.pendingUnsent += 1;
    }
    byOrder.set(key, summary);
  }

  return orders.map((o) => ({ ...o, kitchen: byOrder.get(o._id.toString()) ?? emptyKitchenSummary() }));
}

export async function archiveOrders(ctx: RequestContext, query: OrderFilterInput) {
  await requireOwner(ctx, "archive orders");
  const repo = new OrdersRepository(ctx.restaurantId);

  const orders = await repo.findOrdersForClearing(await buildOrderFilter(repo, query));
  if (orders.length === 0) return { archived: 0, deleted: 0 };

  const finished = orders.filter((o) => o.status === "closed" || o.status === "cancelled").map((o) => o._id);
  const openUnbilled = orders.filter((o) => o.status === "open" && !o.invoiceNumber).map((o) => o._id);
  const sent = new Set((await repo.findOrderIdsWithSentItems(openUnbilled)).map((id) => id.toString()));
  const testOrders = orders.filter((o) => openUnbilled.includes(o._id) && !sent.has(o._id.toString()));

  if (finished.length > 0) await repo.archiveOrders(finished);
  if (testOrders.length > 0) {
    await repo.deleteOrdersCascade(testOrders.map((o) => o._id));
    const tableIds = testOrders
      .filter((o) => o.orderType === "dine-in" && o.tableId)
      .map((o) => o.tableId as Types.ObjectId);
    if (tableIds.length > 0) await repo.releaseSeatedTables(tableIds);
  }

  await writeAudit(
    ctx,
    "order.archive",
    `Archived ${finished.length} and deleted ${testOrders.length} unsent ${query.type || "all"} order(s)`
  );
  return { archived: finished.length, deleted: testOrders.length };
}

async function getOrderWithTotals(ctx: RequestContext, orderId: string, sortItems: boolean) {
  const order = await getOwnedOrder(ctx, orderId);
  const repo = new OrdersRepository(ctx.restaurantId);
  const items = await repo.findItems(order._id, { sorted: sortItems });
  const restaurant = await repo.findRestaurant();
  const totals = totalsForOrder(order, items, restaurant?.taxRates || []);
  return {
    order,
    items,
    totals,
    prepMessageTemplate: restaurant?.prepMessageTemplate || "",
    prepBufferMinutes: restaurant?.prepBufferMinutes ?? 2,
  };
}

export function getOrder(ctx: RequestContext, orderId: string) {
  return getOrderWithTotals(ctx, orderId, true);
}

export function getInvoice(ctx: RequestContext, orderId: string) {
  return getOrderWithTotals(ctx, orderId, false);
}

export async function getInvoicePdfData(ctx: RequestContext, orderId: string) {
  const order = await getOwnedOrder(ctx, orderId);
  const repo = new OrdersRepository(ctx.restaurantId);
  const items = await repo.findItems(order._id);
  const restaurant = await repo.findRestaurant();
  if (!restaurant) throw new HttpError(404, "Restaurant not found");
  const totals = totalsForOrder(order, items, restaurant.taxRates);
  return { restaurant, order, items, totals };
}

export async function listOrderCoupons(ctx: RequestContext, orderId: string) {
  const order = await getOwnedOrder(ctx, orderId);
  const repo = new OrdersRepository(ctx.restaurantId);
  const items = await repo.findItems(order._id);
  const restaurant = await repo.findRestaurant();
  if (!restaurant) throw new HttpError(404, "Restaurant not found");
  const { subtotal } = computeInvoiceTotals(items, restaurant.taxRates, 0);

  const coupons = await repo.findActiveCoupons();
  const now = Date.now();

  const usable = coupons
    .filter((c) => !(c.expiresAt && c.expiresAt.getTime() < now))
    .filter((c) => !(c.usageLimit !== undefined && c.usageLimit !== null && c.usedCount >= c.usageLimit))
    .map((c) => {
      const meetsMinimum = subtotal >= c.minOrderValue;
      return {
        code: c.code,
        type: c.type,
        value: c.value,
        minOrderValue: c.minOrderValue,
        maxDiscountAmount: c.maxDiscountAmount,
        eligible: meetsMinimum,
        discount: meetsMinimum ? computeDiscountAmount(c, subtotal) : 0,
        reason: meetsMinimum ? null : `Needs a minimum order of ${c.minOrderValue.toFixed(2)}`,
      };
    })
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.discount - a.discount);

  return { subtotal, coupons: usable };
}

export async function applyCoupon(ctx: RequestContext, orderId: string, code: string) {
  const order = await getOwnedOrder(ctx, orderId);
  if (order.status !== "open") throw new HttpError(409, "A coupon can only be applied to an open order");

  const repo = new OrdersRepository(ctx.restaurantId);
  const items = await repo.findItems(order._id);
  const subtotal = items.filter((i) => i.status !== "cancelled").reduce((sum, i) => sum + i.total, 0);

  const coupon = await findValidCoupon(ctx.restaurantId, code.toUpperCase(), subtotal);
  const discountAmount = computeDiscountAmount(coupon, subtotal);

  order.couponCode = coupon.code;
  order.discountAmount = discountAmount;
  await repo.saveOrder(order);

  const restaurant = await repo.findRestaurant();
  const totals = computeInvoiceTotals(items, restaurant?.taxRates || [], discountAmount);
  return { order, totals };
}

export async function removeCoupon(ctx: RequestContext, orderId: string) {
  const order = await getOwnedOrder(ctx, orderId);
  if (order.status !== "open") throw new HttpError(409, "A coupon can only be changed on an open order");

  const repo = new OrdersRepository(ctx.restaurantId);
  order.couponCode = undefined;
  order.discountAmount = 0;
  await repo.saveOrder(order);

  const items = await repo.findItems(order._id);
  const restaurant = await repo.findRestaurant();
  const totals = computeInvoiceTotals(items, restaurant?.taxRates || [], 0);
  return { order, totals };
}
