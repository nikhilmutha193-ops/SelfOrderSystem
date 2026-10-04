import { RequestContext } from "../../core/context";
import { IOrder } from "../../models/Order";
import { writeAudit } from "../../utils/audit";
import { HttpError } from "../../utils/httpError";
import { sendOrderToKitchen } from "../kitchen/kitchen.service";
import { generateBill, settleOrder } from "../orders/orders.billing";
import { addOrderItems, getOwnedOrder, startCounterOrder, startTakeawayOrder } from "../orders/orders.service";
import { PosRepository } from "./pos.repository";
import { CreatePosOrderInput, OfflineOrderInput } from "./pos.schema";

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function getMenu(ctx: RequestContext) {
  const repo = new PosRepository(ctx.restaurantId);
  const [categories, subcategories, foods, restaurant] = await Promise.all([
    repo.activeCategories(),
    repo.activeSubcategories(),
    repo.activeFoodItems(),
    repo.billingInfo(),
  ]);
  const categoryStation = new Map(categories.map((c) => [c._id.toString(), c.defaultStationId ?? null]));
  const liveSubcategories = new Set(
    subcategories.filter((s) => categoryStation.has(s.categoryId.toString())).map((s) => s._id.toString())
  );
  const foodName = new Map(foods.map((f) => [f._id.toString(), f.name]));
  return {
    billing: {
      restaurantName: restaurant?.name ?? "",
      address: restaurant?.address ?? "",
      gstin: restaurant?.gstin ?? "",
      taxRates: (restaurant?.taxRates ?? []).map((t) => ({ name: t.name, percent: t.percent })),
      serviceChargePercent: restaurant?.billingSettings?.serviceChargePercent ?? 0,
      footerNote: restaurant?.invoiceSettings?.footerNote ?? "",
    },
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
        prices: {
          takeaway: f.priceRules?.takeaway ?? null,
          delivery: f.priceRules?.delivery ?? null,
          areas: Object.fromEntries((f.priceRules?.areas ?? []).map((a) => [a.areaId.toString(), a.price])),
        },
        packagingCharge: f.packagingCharge ?? 0,
        components: (f.comboItems ?? []).map((c) => ({
          name: foodName.get(c.foodItemId.toString()) ?? "",
          quantity: c.quantity,
        })),
      })),
  };
}

export async function getFloor(ctx: RequestContext) {
  const repo = new PosRepository(ctx.restaurantId);
  const [tables, orders, restaurant] = await Promise.all([repo.floorTables(), repo.runningOrders(), repo.areas()]);
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
      areaId: table.areaId ?? null,
      orders: running.filter((o) => o.tableId?.toString() === table._id.toString()),
    })),
    takeaways: running.filter((o) => !o.tableId),
    areas: (restaurant?.areas ?? []).map((a) => ({ _id: a._id, name: a.name })),
  };
}

function offlineResult(
  order: Pick<IOrder, "_id" | "invoiceNumber" | "status" | "bill" | "offline">,
  duplicate = false
) {
  return {
    orderId: order._id,
    invoiceNumber: order.invoiceNumber ?? null,
    status: order.status,
    grandTotal: order.bill?.grandTotal ?? null,
    clientTotal: order.offline?.clientTotal ?? null,
    mismatch: order.offline?.mismatch ?? false,
    note: order.offline?.note ?? null,
    duplicate,
  };
}

export async function syncOfflineOrder(ctx: RequestContext, input: OfflineOrderInput) {
  const repo = new PosRepository(ctx.restaurantId);
  const existing = await repo.findOfflineOrder(input.clientId);
  if (existing) return offlineResult(existing, true);

  const ids = [...new Set(input.items.map((line) => line.foodItemId))];
  if ((await repo.countActiveFoodItems(ids)) !== ids.length) {
    throw new HttpError(409, "A dish on this offline bill is no longer on the menu. Turn it back on, then sync again.");
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
      : await startCounterOrder(ctx, { ...customer, tableId: input.tableId, allowOccupied: true });

  const createdAt = input.createdAt.getTime() > Date.now() ? new Date() : input.createdAt;
  await repo.markOffline(order._id, {
    clientId: input.clientId,
    createdAt,
    clientTotal: input.clientTotal,
    syncedAt: new Date(),
    mismatch: false,
  });

  const orderId = order._id.toString();
  await addOrderItems(ctx, orderId, { items: input.items });
  await sendOrderToKitchen(ctx.restaurantId, order, { silent: true });
  await repo.markItemsServed(order._id);
  await generateBill(ctx, orderId, {});

  let billed = await getOwnedOrder(ctx, orderId);
  const serverTotal = billed.bill?.grandTotal ?? 0;
  if (Math.abs(serverTotal - input.clientTotal) > 0.009) {
    await repo.flagOffline(
      order._id,
      `Offline bill was ₹${input.clientTotal.toFixed(2)}, the server bill is ₹${serverTotal.toFixed(2)}. Settle it from Orders.`
    );
  } else if (input.payments?.length) {
    try {
      await settleOrder(ctx, orderId, { payments: input.payments });
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      await repo.flagOffline(order._id, `Could not settle: ${err.message}`);
    }
  }

  billed = await getOwnedOrder(ctx, orderId);
  await writeAudit(
    ctx,
    "pos.offlineSync",
    `Synced offline bill ${input.clientId} as ${billed.invoiceNumber} (₹${serverTotal.toFixed(2)})`
  );
  return offlineResult(billed);
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
