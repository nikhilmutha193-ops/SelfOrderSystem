import { RequestContext } from "../../core/context";
import { emit } from "../../core/events";
import { IOrder } from "../../models/Order";
import { HttpError } from "../../utils/httpError";
import { nextTokenNumber } from "../../utils/kotQueue";
import { getOwnedOrder } from "../orders/orders.service";
import { enqueueKot } from "../printing/printing.service";
import { KitchenRepository } from "./kitchen.repository";

export async function getKotQueue(ctx: RequestContext, tableId?: string, stationId?: string) {
  const repo = new KitchenRepository(ctx.restaurantId);
  const orders = await repo.findOpenOrdersWithTable(tableId);
  const items = await repo.findActiveItems(
    orders.map((o) => o._id),
    stationId
  );

  const itemsByOrder = new Map<string, typeof items>();
  for (const item of items) {
    const key = item.orderId.toString();
    if (!itemsByOrder.has(key)) itemsByOrder.set(key, []);
    itemsByOrder.get(key)!.push(item);
  }

  return orders
    .map((order) => {
      const orderItems = itemsByOrder.get(order._id.toString()) ?? [];
      const numbers = orderItems.map((i) => i.tokenNumber).filter((n): n is number => typeof n === "number");
      return { order, items: orderItems, tokenNumber: numbers.length ? Math.min(...numbers) : null };
    })
    .filter((group) => group.items.length > 0)
    .sort((a, b) => (a.tokenNumber ?? Number.MAX_SAFE_INTEGER) - (b.tokenNumber ?? Number.MAX_SAFE_INTEGER));
}

export async function sendOrderToKitchen(restaurantId: string, order: Pick<IOrder, "_id" | "status">) {
  if (order.status !== "open" && order.status !== "billed") {
    throw new HttpError(409, "This order is closed, so nothing can be sent to the kitchen");
  }
  const repo = new KitchenRepository(restaurantId);
  const nothingToSend = { round: null, items: [], message: "No new items to send to the kitchen" };
  if (!(await repo.hasUnsentItems(order._id))) return nothingToSend;
  const round = await repo.nextKotRound(order._id);
  if ((await repo.claimUnsentItems(order._id, round)) === 0) return nothingToSend;

  const restaurant = await repo.findRestaurant("dayEndTime timezone prepBufferMinutes");
  const { tokenNumber } = await nextTokenNumber(restaurantId, restaurant?.dayEndTime, restaurant?.timezone);
  await repo.setRoundToken(order._id, round, tokenNumber);

  const items = await repo.findRoundItems(order._id, round);
  const prepTimes = await repo.findPrepTimes(items.filter((i) => i.foodItemId).map((i) => i.foodItemId!));
  const longest = Math.max(0, ...prepTimes.map((f) => f.prepTimeMinutes ?? 0));
  const buffer = restaurant?.prepBufferMinutes ?? 0;
  await repo.pushEstimate(order._id, new Date(Date.now() + (longest + buffer) * 60_000));

  await emit("order.kotSent", {
    restaurantId,
    orderId: order._id.toString(),
    round,
    tokenNumber,
    itemIds: items.map((item) => item._id.toString()),
  });
  return { round, tokenNumber, items };
}

export async function printKot(ctx: RequestContext, orderId: string) {
  const order = await getOwnedOrder(ctx, orderId);
  return sendOrderToKitchen(ctx.restaurantId, order);
}

export async function reprintKot(ctx: RequestContext, orderId: string, round: number) {
  const order = await getOwnedOrder(ctx, orderId);
  const queued = await enqueueKot(ctx.restaurantId, order._id, round, { reprint: true });
  if (queued === 0) throw new HttpError(409, "No printer is set up for this ticket");
  return { queued };
}

export async function sendGuestItemsIfAutomatic(restaurantId: string, orderId: string) {
  const repo = new KitchenRepository(restaurantId);
  const restaurant = await repo.findRestaurant("kotSettings");
  if (restaurant?.kotSettings?.guestOrderMode === "accept") return;
  const order = await repo.findOrder(orderId);
  if (order) await sendOrderToKitchen(restaurantId, order);
}

export async function getKotPdfData(ctx: RequestContext, orderId: string, round: number) {
  const order = await getOwnedOrder(ctx, orderId);
  const repo = new KitchenRepository(ctx.restaurantId);
  const items = await repo.findRoundItems(order._id, round);
  if (items.length === 0) throw new HttpError(404, "No KOT ticket found for that round");
  const restaurant = await repo.findRestaurant();
  if (!restaurant) throw new HttpError(404, "Restaurant not found");

  let tableCode: string | undefined;
  if (order.orderType === "dine-in" && order.tableId) {
    const table = await repo.findTableCode(order.tableId);
    tableCode = table?.code;
  }

  return { restaurant, order, round, items, tableCode, tokenNumber: items[0]?.tokenNumber ?? null };
}

export async function startPreparingItem(ctx: RequestContext, itemId: string) {
  const item = await new KitchenRepository(ctx.restaurantId).transitionItem(
    itemId,
    { status: "pending", kotRound: { $ne: null } },
    { status: "preparing" }
  );
  if (!item) throw new HttpError(404, "Item not found, already in progress, or not yet sent to the kitchen");
  return item;
}

export async function markItemReady(ctx: RequestContext, itemId: string) {
  const item = await new KitchenRepository(ctx.restaurantId).transitionItem(
    itemId,
    { status: "preparing" },
    { status: "ready", readyAt: new Date() }
  );
  if (!item) throw new HttpError(404, "Item is not currently preparing");
  return item;
}

export async function serveOrderItem(ctx: RequestContext, itemId: string) {
  const item = await new KitchenRepository(ctx.restaurantId).transitionItem(
    itemId,
    { status: { $in: ["pending", "preparing", "ready"] } },
    { status: "served" }
  );
  if (!item) throw new HttpError(404, "Order item not found or already served/cancelled");
  return item;
}
