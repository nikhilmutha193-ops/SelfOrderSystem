import { RequestContext } from "../../core/context";
import { HttpError } from "../../utils/httpError";
import { sendOrderToKitchen } from "../kitchen/kitchen.service";
import { addOrderItems, startCounterOrder, startTakeawayOrder } from "../orders/orders.service";
import { PosRepository } from "./pos.repository";
import { CreatePosOrderInput } from "./pos.schema";

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function getMenu(ctx: RequestContext) {
  const repo = new PosRepository(ctx.restaurantId);
  const [categories, subcategories, foods] = await Promise.all([
    repo.activeCategories(),
    repo.activeSubcategories(),
    repo.activeFoodItems(),
  ]);
  const categoryStation = new Map(categories.map((c) => [c._id.toString(), c.defaultStationId ?? null]));
  const liveSubcategories = new Set(
    subcategories.filter((s) => categoryStation.has(s.categoryId.toString())).map((s) => s._id.toString())
  );
  return {
    categories: categories.map((c) => ({ _id: c._id, name: c.name })),
    items: foods
      .filter((f) => categoryStation.has(f.categoryId.toString()) && liveSubcategories.has(f.subcategoryId.toString()))
      .map((f) => ({
        _id: f._id,
        name: f.name,
        price: f.price,
        categoryId: f.categoryId,
        foodType: f.foodType,
        shortCode: f.shortCode ?? null,
        isBestseller: f.isBestseller,
        modifierGroups: f.modifierGroups ?? [],
        stationId: f.stationId ?? categoryStation.get(f.categoryId.toString()) ?? null,
      })),
  };
}

export async function getFloor(ctx: RequestContext) {
  const repo = new PosRepository(ctx.restaurantId);
  const [tables, orders] = await Promise.all([repo.floorTables(), repo.runningOrders()]);
  const captainIds = tables.flatMap((t) => (t.captainId ? [t.captainId] : []));
  const [summaries, captains] = await Promise.all([
    repo.itemSummaries(orders.map((o) => o._id)),
    captainIds.length ? repo.captainNames(captainIds) : Promise.resolve([]),
  ]);
  const summaryOf = new Map(summaries.map((s) => [s._id.toString(), s]));
  const captainName = new Map(captains.map((c) => [c._id.toString(), c.username]));

  const running = orders.map((order) => {
    const summary = summaryOf.get(order._id.toString());
    return {
      _id: order._id,
      orderType: order.orderType,
      tableId: order.tableId ?? null,
      customerName: order.customerName,
      status: order.status,
      invoiceNumber: order.invoiceNumber ?? null,
      createdAt: order.createdAt,
      itemCount: summary?.itemCount ?? 0,
      total: order.status === "billed" && order.bill ? order.bill.grandTotal : round2(summary?.subtotal ?? 0),
      unsent: summary?.unsent ?? 0,
      ready: summary?.ready ?? 0,
    };
  });

  return {
    tables: tables.map((table) => ({
      _id: table._id,
      code: table.code,
      status: table.status,
      occupiedAt: table.occupiedAt ?? null,
      captainId: table.captainId ?? null,
      captainName: table.captainId ? (captainName.get(table.captainId.toString()) ?? null) : null,
      orders: running.filter((o) => o.tableId?.toString() === table._id.toString()),
    })),
    takeaways: running.filter((o) => !o.tableId),
  };
}

export async function createOrder(ctx: RequestContext, input: CreatePosOrderInput) {
  const repo = new PosRepository(ctx.restaurantId);
  const ids = [...new Set(input.items.map((line) => line.foodItemId))];
  if ((await repo.countActiveFoodItems(ids)) !== ids.length) {
    throw new HttpError(404, "One of these items is no longer on the menu");
  }
  if (input.orderType === "dine-in" && !input.tableId) throw new HttpError(400, "Choose a table for a dine-in order");

  const customer = {
    customerName: input.customerName || (input.orderType === "takeaway" ? "Walk-in" : "Guest"),
    customerPhone: input.customerPhone,
    members: input.members,
  };
  const order =
    input.orderType === "takeaway"
      ? await startTakeawayOrder(ctx, customer)
      : await startCounterOrder(ctx, { ...customer, tableId: input.tableId });

  const items = await addOrderItems(ctx, order._id.toString(), { items: input.items });
  const kot = input.sendToKitchen ? await sendOrderToKitchen(ctx.restaurantId, order) : null;
  return {
    order,
    items,
    kot: kot?.round ? { round: kot.round, tokenNumber: kot.tokenNumber } : null,
  };
}
