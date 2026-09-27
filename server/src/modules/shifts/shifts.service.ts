import { HydratedDocument } from "mongoose";

import { RequestContext } from "../../core/context";
import { IOrder } from "../../models/Order";
import { IShift } from "../../models/Shift";
import { writeAudit } from "../../utils/audit";
import { businessDateLabel, getBusinessDayRangeForDate } from "../../utils/businessDay";
import { HttpError } from "../../utils/httpError";
import { round2 } from "../../utils/invoice";
import { ShiftsRepository } from "./shifts.repository";
import { CashMovementInput, CloseDayInput, CloseShiftInput } from "./shifts.schema";

type ShiftDoc = HydratedDocument<IShift>;

function actor(ctx: RequestContext) {
  return { id: ctx.auth.id, name: ctx.admin?.username };
}

async function expectedCash(
  repo: ShiftsRepository,
  shift: Pick<IShift, "openedAt" | "closedAt" | "openingFloat" | "cashMovements">
) {
  const end = shift.closedAt ?? new Date();
  const cashSales = await repo.cashReceivedBetween(shift.openedAt, end);
  const cashIn = shift.cashMovements.filter((m) => m.type === "in").reduce((s, m) => s + m.amount, 0);
  const cashOut = shift.cashMovements.filter((m) => m.type === "out").reduce((s, m) => s + m.amount, 0);
  return {
    cashSales: round2(cashSales),
    cashIn: round2(cashIn),
    cashOut: round2(cashOut),
    expectedCash: round2(shift.openingFloat + cashSales + cashIn - cashOut),
  };
}

async function describeShift(repo: ShiftsRepository, shift: ShiftDoc) {
  return { ...shift.toObject(), ...(await expectedCash(repo, shift)) };
}

export async function currentShift(ctx: RequestContext) {
  const repo = new ShiftsRepository(ctx.restaurantId);
  const shift = await repo.findOpenShift();
  return shift ? describeShift(repo, shift) : null;
}

export async function openShift(ctx: RequestContext, openingFloat: number) {
  const repo = new ShiftsRepository(ctx.restaurantId);
  if (await repo.findOpenShift())
    throw new HttpError(409, "A shift is already open. Close it before opening a new one.");
  const who = actor(ctx);
  let shift: ShiftDoc;
  try {
    shift = await repo.createShift({ openingFloat, openedBy: who.id, openedByName: who.name, openedAt: new Date() });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw new HttpError(409, "A shift is already open. Close it before opening a new one.");
    }
    throw err;
  }
  await writeAudit(ctx, "shift.open", `Opened a shift with a ₹${openingFloat.toFixed(2)} float`);
  return describeShift(repo, shift);
}

export async function addCashMovement(ctx: RequestContext, input: CashMovementInput) {
  const repo = new ShiftsRepository(ctx.restaurantId);
  const shift = await repo.findOpenShift();
  if (!shift) throw new HttpError(409, "Open a shift first");
  const who = actor(ctx);
  shift.cashMovements.push({ ...input, by: who.id, byName: who.name, at: new Date() });
  await shift.save();
  await writeAudit(
    ctx,
    `shift.cash${input.type === "in" ? "In" : "Out"}`,
    `Cash ${input.type} ₹${input.amount.toFixed(2)}: ${input.reason}`
  );
  return describeShift(repo, shift);
}

export async function closeShift(ctx: RequestContext, input: CloseShiftInput) {
  const repo = new ShiftsRepository(ctx.restaurantId);
  const shift = await repo.findOpenShift();
  if (!shift) throw new HttpError(409, "There is no open shift to close");
  const closedAt = new Date();
  const totals = await expectedCash(repo, { ...shift.toObject(), closedAt });
  const who = actor(ctx);
  shift.set({
    isOpen: false,
    closedAt,
    closedBy: who.id,
    closedByName: who.name,
    countedCash: input.countedCash,
    expectedCash: totals.expectedCash,
    variance: round2(input.countedCash - totals.expectedCash),
    closingNote: input.note,
  });
  await shift.save();
  await writeAudit(
    ctx,
    "shift.close",
    `Closed shift: expected ₹${totals.expectedCash.toFixed(2)}, counted ₹${input.countedCash.toFixed(2)}`
  );
  return { ...shift.toObject(), ...totals };
}

export function listShifts(ctx: RequestContext) {
  return new ShiftsRepository(ctx.restaurantId).listShifts(30);
}

function sumBy<T>(rows: T[], key: (row: T) => string, value: (row: T) => number) {
  const map = new Map<string, { amount: number; count: number }>();
  for (const row of rows) {
    const k = key(row);
    const entry = map.get(k) ?? { amount: 0, count: 0 };
    entry.amount += value(row);
    entry.count += 1;
    map.set(k, entry);
  }
  return Array.from(map, ([name, v]) => ({ name, amount: round2(v.amount), count: v.count })).sort(
    (a, b) => b.amount - a.amount
  );
}

function billAmount(order: IOrder) {
  return order.bill?.grandTotal ?? 0;
}

async function resolveDate(repo: ShiftsRepository, date: string | undefined) {
  const restaurant = await repo.findRestaurant();
  const businessDate = date ?? businessDateLabel(new Date(), restaurant?.dayEndTime, restaurant?.timezone);
  const { start, end } = getBusinessDayRangeForDate(businessDate, restaurant?.dayEndTime, restaurant?.timezone);
  return { businessDate, start, end };
}

export async function buildDayReport(ctx: RequestContext, date: string | undefined) {
  const repo = new ShiftsRepository(ctx.restaurantId);
  const { businessDate, start, end } = await resolveDate(repo, date);

  const [paid, billed, voided, cancelledBills, unsettled, shifts, closed] = await Promise.all([
    repo.findPaidOrders(start, end),
    repo.findBilledOrders(start, end),
    repo.findVoidedOrders(start, end),
    repo.findCancelledBills(start, end),
    repo.findUnsettledBefore(end),
    repo.findShiftsOverlapping(start, end),
    repo.findDayClose(businessDate),
  ]);

  const items = await repo.findItemsForOrders(paid.map((o) => o._id));
  const categoryOf = await repo.categoryNamesForFoods(items.filter((i) => i.foodItemId).map((i) => i.foodItemId!));
  const sold = items.filter((i) => !i.complimentary);
  const complimentary = items.filter((i) => i.complimentary);

  const bills = paid.map((o) => o.bill).filter((b): b is NonNullable<IOrder["bill"]> => !!b);
  const sum = (pick: (b: NonNullable<IOrder["bill"]>) => number) => round2(bills.reduce((s, b) => s + pick(b), 0));

  const taxes = new Map<string, { name: string; percent: number; amount: number }>();
  for (const bill of bills) {
    for (const t of bill.taxLines) {
      const key = `${t.name}|${t.percent}`;
      const entry = taxes.get(key) ?? { name: t.name, percent: t.percent, amount: 0 };
      entry.amount = round2(entry.amount + t.amount);
      taxes.set(key, entry);
    }
  }

  const payments = paid.flatMap((o) => o.payments ?? []);
  const invoiceNumbers = billed.map((o) => o.invoiceNumber!).sort();

  return {
    businessDate,
    window: { start, end },
    closed: closed ? { closedAt: closed.closedAt, closedByName: closed.closedByName } : null,
    invoiceRange: {
      first: invoiceNumbers[0] ?? null,
      last: invoiceNumbers[invoiceNumbers.length - 1] ?? null,
      count: invoiceNumbers.length,
    },
    totals: {
      bills: paid.length,
      gross: sum((b) => b.subtotal),
      discounts: sum((b) => b.discount),
      serviceCharge: sum((b) => b.serviceCharge ?? 0),
      taxable: sum((b) => b.taxableAmount),
      tax: sum((b) => b.taxLines.reduce((s, t) => s + t.amount, 0)),
      roundOff: sum((b) => b.roundOff),
      net: sum((b) => b.grandTotal),
    },
    byOrderType: sumBy(paid, (o) => o.orderType, billAmount),
    byPaymentMethod: sumBy(
      payments,
      (p) => p.method,
      (p) => p.amount
    ),
    byCategory: sumBy(
      sold,
      (i) => (i.foodItemId ? (categoryOf.get(i.foodItemId.toString()) ?? "Uncategorised") : "Other"),
      (i) => i.total
    ),
    taxes: Array.from(taxes.values()),
    voids: {
      count: voided.length,
      amount: round2(voided.reduce((s, o) => s + billAmount(o), 0)),
      bills: voided.map((o) => ({ invoiceNumber: o.invoiceNumber, amount: billAmount(o), reason: o.voidReason })),
    },
    cancelledBills: {
      count: cancelledBills.length,
      amount: round2(cancelledBills.reduce((s, o) => s + billAmount(o), 0)),
      bills: cancelledBills.map((o) => ({
        invoiceNumber: o.invoiceNumber,
        amount: billAmount(o),
        reason: o.cancelReason,
      })),
    },
    complimentary: {
      count: complimentary.reduce((s, i) => s + i.quantity, 0),
      value: round2(complimentary.reduce((s, i) => s + i.unitPrice * i.quantity, 0)),
    },
    unsettled: unsettled.map((o) => ({
      orderId: o._id,
      customerName: o.customerName,
      status: o.status,
      invoiceNumber: o.invoiceNumber ?? null,
      checkinTime: o.checkinTime,
      amount: o.bill?.grandTotal ?? null,
    })),
    shifts: shifts.map((s) => ({
      openedAt: s.openedAt,
      closedAt: s.closedAt,
      openedByName: s.openedByName,
      openingFloat: s.openingFloat,
      expectedCash: s.expectedCash ?? null,
      countedCash: s.countedCash ?? null,
      variance: s.variance ?? null,
    })),
  };
}

export async function closeDay(ctx: RequestContext, input: CloseDayInput) {
  const repo = new ShiftsRepository(ctx.restaurantId);
  const report = await buildDayReport(ctx, input.date);
  if (report.closed) throw new HttpError(409, `${report.businessDate} is already closed`);
  if (report.unsettled.length > 0 && !input.carryForward) {
    const n = report.unsettled.length;
    throw new HttpError(
      409,
      `${n} order${n === 1 ? " is" : "s are"} still unpaid. Settle ${n === 1 ? "it" : "them"} or carry ${n === 1 ? "it" : "them"} forward.`
    );
  }

  const who = actor(ctx);
  try {
    await repo.createDayClose({
      businessDate: report.businessDate,
      businessDayStart: report.window.start,
      businessDayEnd: report.window.end,
      closedAt: new Date(),
      closedBy: who.id,
      closedByName: who.name,
      carriedForward: report.unsettled.map((u) => u.orderId),
      report: { ...report, closed: undefined },
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new HttpError(409, `${report.businessDate} is already closed`);
    throw err;
  }

  await writeAudit(
    ctx,
    "day.close",
    `Closed ${report.businessDate}: ₹${report.totals.net.toFixed(2)} from ${report.totals.bills} bill(s)` +
      (report.unsettled.length ? `, ${report.unsettled.length} carried forward` : "")
  );
  return buildDayReport(ctx, report.businessDate);
}

export function listDayCloses(ctx: RequestContext) {
  return new ShiftsRepository(ctx.restaurantId).listDayCloses(60);
}

export async function getDayClose(ctx: RequestContext, date: string) {
  const record = await new ShiftsRepository(ctx.restaurantId).findDayClose(date);
  if (!record) throw new HttpError(404, `${date} hasn't been closed`);
  return record;
}
