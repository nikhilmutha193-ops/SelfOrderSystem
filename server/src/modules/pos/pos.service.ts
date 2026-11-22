import { RequestContext } from "../../core/context";
import { IOrder } from "../../models/Order";
import { writeAudit } from "../../utils/audit";
import { paysUpfront, restaurantIsCafe, restaurantPaidBeforeKitchen, takeawayPaysFirst } from "../../utils/dineInPayment";
import { HttpError } from "../../utils/httpError";
import { cancelUnsentOrdersForTables } from "../../utils/tableRelease";
import { syncTableState } from "../../utils/tableState";
import { getBusinessDayStart } from "../../utils/businessDay";
import { sendOrderToKitchen } from "../kitchen/kitchen.service";
import { generateBill, settleOrder } from "../orders/orders.billing";
import { addOrderItems, getOwnedOrder, startCounterOrder, startTakeawayOrder } from "../orders/orders.service";
import { enqueueBill, enqueueKot } from "../printing/printing.service";
import { PosRepository } from "./pos.repository";
import { CreatePosOrderInput, OfflineOrderInput } from "./pos.schema";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** With "Use tables in the POS" off, a dine-in order without a table is a normal counter order. */
async function posUsesTables(repo: PosRepository): Promise<boolean> {
  const restaurant = await repo.billingInfo();
  return restaurant?.billingSettings?.posUseTables !== false;
}

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
      dineInPayment: paysUpfront(restaurant) ? "upfront" : "after",
      takeawayPayFirst: takeawayPaysFirst(restaurant),
      useTables: restaurant?.billingSettings?.posUseTables !== false,
      footerNote: restaurant?.invoiceSettings?.footerNote ?? "",
      serviceFlow: restaurant?.serviceFlow ?? "restaurant",
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
        imageUrl: f.imageUrl ?? "",
        shortCode: f.shortCode ?? null,
        isBestseller: f.isBestseller,
        jainAvailable: f.jainAvailable !== false,
        spiceAdjustable: f.spiceAdjustable !== false,
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

  // A kiosk order still being paid on the kiosk isn't the till's business until the guest picks "Pay at counter".
  const tillOrders = orders.filter((o) => !(o.source === "kiosk" && o.status === "open" && !o.kiosk?.payAtCounter));
  const tableCode = new Map(tables.map((t) => [t._id.toString(), t.code]));
  const running = tillOrders.map((order) => {
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
      source: order.source,
      // A guest who left to pay at the counter: the bill is settled here, but it no longer holds its table.
      payAtCounter: !!order.payAtCounter,
      tableCode: order.tableId ? (tableCode.get(order.tableId.toString()) ?? null) : null,
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
      isGuest: !!table.isGuest,
      orders: running.filter((o) => o.tableId?.toString() === table._id.toString() && !o.payAtCounter),
    })),
    // Running takeaways, plus bills guests left to pay at the counter.
    takeaways: running.filter((o) => !o.tableId || o.payAtCounter),
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
  if (input.orderType === "dine-in" && !input.tableId && (await posUsesTables(repo))) {
    throw new HttpError(400, "Choose a table for a dine-in order");
  }

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
  if (input.orderType === "dine-in" && !input.tableId && (await posUsesTables(repo))) {
    throw new HttpError(400, "Choose a table for a dine-in order");
  }

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
  // An order that is paid first (cafe flow, a pay-first table, takeaway and counter pay first) is held until it is paid; payment sends the KOT.
  const send = input.sendToKitchen && !(await restaurantPaidBeforeKitchen(ctx.restaurantId, input.orderType));
  const kot = send ? await sendOrderToKitchen(ctx.restaurantId, order) : null;
  return {
    order,
    items,
    kot: kot?.round ? { round: kot.round, tokenNumber: kot.tokenNumber } : null,
  };
}

/** Ends a seated table's session from the till (cashiers have Orders access, not Tables). */
export async function releaseTable(ctx: RequestContext, tableId: string) {
  const table = await new PosRepository(ctx.restaurantId).findTable(tableId);
  if (!table) throw new HttpError(404, "Table not found");
  if (table.isGuest) throw new HttpError(409, "Walk-in tables never need releasing");
  const cancelledOrders = await cancelUnsentOrdersForTables([table._id], {
    includeCounter: await restaurantIsCafe(ctx.restaurantId),
  });
  const status = await syncTableState(table._id, { endSession: true });
  await writeAudit(ctx, "table.release", `Released table ${table.code} from the POS`);
  return { status, cancelledOrders };
}

/**
 * Every order of the business day (running, billed, paid, cancelled) with how far each dish got and what state its table
 * is in, so the cashier can check which invoices were not printed yet and print, share or reprint them.
 */
export async function getToday(ctx: RequestContext) {
  const repo = new PosRepository(ctx.restaurantId);
  const restaurant = await repo.restaurantDay();
  const since = getBusinessDayStart(new Date(), restaurant?.dayEndTime, restaurant?.timezone);
  // A kiosk order still being paid on the kiosk isn't the till's business yet (same rule as the floor).
  const orders = (await repo.todaysOrders(since)).filter(
    (o) => !(o.source === "kiosk" && o.status === "open" && !o.kiosk?.payAtCounter)
  );
  const orderIds = orders.map((o) => o._id);
  const [tables, states, lines] = await Promise.all([repo.floorTables(), repo.itemStates(orderIds), repo.itemLines(orderIds)]);
  const linesOf = new Map<string, typeof lines>();
  for (const line of lines) linesOf.set(line.orderId.toString(), [...(linesOf.get(line.orderId.toString()) ?? []), line]);
  const tableOf = new Map(tables.map((t) => [t._id.toString(), t]));
  const stateOf = new Map(states.map((s) => [s._id.toString(), s]));
  const rows = orders.map((o) => {
    const table = o.tableId ? tableOf.get(o.tableId.toString()) : undefined;
    const state = stateOf.get(o._id.toString());
    const dishes = linesOf.get(o._id.toString()) ?? [];
    // KOT token numbers (one per round), or the kiosk's pickup number before anything was sent.
    const tokens = [...new Set(dishes.map((d) => d.tokenNumber).filter((t): t is number => typeof t === "number"))].sort((a, b) => a - b);
    if (tokens.length === 0 && typeof o.pickupNumber === "number") tokens.push(o.pickupNumber);
    return {
      _id: o._id,
      tokens,
      lines: dishes.slice(0, 40).map((d) => ({
        name: d.foodName,
        quantity: d.quantity,
        status: d.status,
        sent: d.kotRound != null,
        token: d.tokenNumber ?? null,
        jain: !!d.isJain,
        pack: !!d.isPacked,
        free: !!d.complimentary,
        options: (d.modifiers ?? []).map((m) => m.label).filter(Boolean),
        note: d.note ?? "",
        combo: (d.components ?? []).map((c) => (c.quantity > 1 ? `${c.quantity}× ${c.name}` : c.name)),
      })),
      orderType: o.orderType,
      tableCode: table?.code ?? null,
      // Walk-in tables are never occupied, so they have no state to show.
      tableStatus: table && !table.isGuest ? table.status : null,
      customerName: o.customerName,
      hasPhone: !!o.customerPhone?.replace(/\D/g, ""),
      status: o.status,
      invoiceNumber: o.invoiceNumber ?? null,
      at: o.billedAt ?? o.checkinTime,
      total: o.bill?.grandTotal ?? round2(state?.subtotal ?? 0),
      paymentMethod: o.paymentMethod,
      payAtCounter: !!o.payAtCounter,
      source: o.source,
      invoicePrintedAt: o.invoicePrintedAt ?? null,
      invoicePrintCount: o.invoicePrintCount ?? 0,
      lastKotRound: state?.lastKotRound ?? null,
      items: {
        total: state?.total ?? 0,
        unsent: state?.unsent ?? 0,
        waiting: state?.waiting ?? 0,
        preparing: state?.preparing ?? 0,
        ready: state?.ready ?? 0,
        served: state?.served ?? 0,
        cancelled: state?.cancelled ?? 0,
      },
    };
  });
  const hasInvoice = (r: (typeof rows)[number]) => !!r.invoiceNumber && (r.status === "billed" || r.status === "closed");
  return { since, orders: rows, notPrinted: rows.filter((r) => hasInvoice(r) && !r.invoicePrintedAt).length };
}

/**
 * Prints the KOT and the invoice of a billed or paid order as separate slips: one ticket per KOT round and one invoice,
 * each its own print job. When there is no printer for one of them the other still prints and the answer says which.
 */
export async function printBoth(ctx: RequestContext, orderId: string) {
  const order = await getOwnedOrder(ctx, orderId);
  if (!order.invoiceNumber || (order.status !== "billed" && order.status !== "closed")) {
    throw new HttpError(409, "Generate the bill first, then print the KOT and invoice together");
  }
  const repo = new PosRepository(ctx.restaurantId);
  const rounds = await repo.kotRounds(order._id);
  // Saving the order just before sent its new items to the kitchen and printed that KOT already: printing it again
  // would give two copies, so a round queued in the last minute is left as it is.
  const justPrinted = new Set(await repo.recentlyPrintedRounds(order._id, new Date(Date.now() - 60_000)));
  let kots = 0;
  for (const round of rounds) {
    if (justPrinted.has(round)) kots++;
    else kots += await enqueueKot(ctx.restaurantId, order._id, round, { reprint: true });
  }
  const invoices = await enqueueBill(ctx.restaurantId, order._id);
  if (kots === 0 && invoices === 0) throw new HttpError(409, "No printer is set up for these slips");
  return { kots, invoices, rounds: rounds.length };
}

/** The invoice was opened as a PDF to print from the browser (no printer set up): count it as printed. */
export async function markInvoicePrinted(ctx: RequestContext, orderId: string) {
  const order = await getOwnedOrder(ctx, orderId);
  if (!order.invoiceNumber) throw new HttpError(409, "This order has no invoice yet");
  await new PosRepository(ctx.restaurantId).markInvoicePrinted(order._id);
  return { message: "Noted" };
}
