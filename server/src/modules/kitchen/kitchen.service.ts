import { RequestContext } from "../../core/context";
import { emit } from "../../core/events";
import { HttpError } from "../../utils/httpError";
import { nextTokenNumber } from "../../utils/kotQueue";
import { getOwnedOrder } from "../orders/orders.service";
import { KitchenRepository } from "./kitchen.repository";

export async function getKotQueue(ctx: RequestContext, tableId?: string) {
  const repo = new KitchenRepository(ctx.restaurantId);
  const orders = await repo.findOpenOrdersWithTable(tableId);
  const items = await repo.findActiveItems(orders.map((o) => o._id));

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

export async function printKot(ctx: RequestContext, orderId: string) {
  const order = await getOwnedOrder(ctx, orderId);
  if (order.status !== "open" && order.status !== "billed") {
    throw new HttpError(409, "This order is closed, so nothing can be sent to the kitchen");
  }
  const repo = new KitchenRepository(ctx.restaurantId);
  const nothingToSend = { round: null, items: [], message: "No new items to send to the kitchen" };
  if (!(await repo.hasUnsentItems(order._id))) return nothingToSend;
  const round = await repo.nextKotRound(order._id);
  if ((await repo.claimUnsentItems(order._id, round)) === 0) return nothingToSend;

  const restaurant = await repo.findRestaurant("dayEndTime timezone");
  const { tokenNumber } = await nextTokenNumber(ctx.restaurantId, restaurant?.dayEndTime, restaurant?.timezone);
  await repo.setRoundToken(order._id, round, tokenNumber);

  const items = await repo.findRoundItems(order._id, round);
  await emit("order.kotSent", {
    restaurantId: ctx.restaurantId,
    orderId: order._id.toString(),
    round,
    tokenNumber,
    itemIds: items.map((item) => item._id.toString()),
  });
  return { round, tokenNumber, items };
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
