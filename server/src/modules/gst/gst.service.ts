import { RequestContext } from "../../core/context";
import { businessDateLabel, getBusinessDayRangeForDate } from "../../utils/businessDay";
import { HttpError } from "../../utils/httpError";
import { round2 } from "../../utils/invoice";
import { GstRepository } from "./gst.repository";
import { GstReportInput } from "./gst.schema";

const MAX_RANGE_DAYS = 400;

interface Totals {
  invoices: number;
  grossSales: number;
  discounts: number;
  serviceCharge: number;
  packaging: number;
  taxableValue: number;
  gst: number;
  roundOff: number;
  invoiceValue: number;
}

const emptyTotals = (): Totals => ({
  invoices: 0,
  grossSales: 0,
  discounts: 0,
  serviceCharge: 0,
  packaging: 0,
  taxableValue: 0,
  gst: 0,
  roundOff: 0,
  invoiceValue: 0,
});

function roundTotals(t: Totals): Totals {
  return Object.fromEntries(
    Object.entries(t).map(([key, value]) => [key, key === "invoices" ? value : round2(value)])
  ) as unknown as Totals;
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

interface ComponentTotals {
  name: string;
  percent: number;
  taxableValue: number;
  amount: number;
  invoices: number;
}

/**
 * GST on the invoices issued in a period, taken from the tax saved on each bill (never recalculated).
 * Voided and cancelled invoices are listed separately and left out of the totals.
 */
export async function gstReport(ctx: RequestContext, input: GstReportInput) {
  if (daysBetween(input.from, input.to) > MAX_RANGE_DAYS) {
    throw new HttpError(400, `Choose a period of at most ${MAX_RANGE_DAYS} days`);
  }
  const repo = new GstRepository(ctx.restaurantId);
  const restaurant = await repo.restaurant();
  const range = {
    $gte: getBusinessDayRangeForDate(input.from, restaurant?.dayEndTime, restaurant?.timezone).start,
    $lt: getBusinessDayRangeForDate(input.to, restaurant?.dayEndTime, restaurant?.timezone).end,
  };
  const [orders, refunds] = await Promise.all([repo.invoices(range), repo.refundsIn(range)]);

  const summary = emptyTotals();
  const byDay = new Map<string, Totals>();
  const byComponent = new Map<string, ComponentTotals>();
  const bySlab = new Map<number, { rate: number; taxableValue: number; gst: number; invoices: number }>();
  const b2b = emptyTotals();
  const b2c = emptyTotals();
  const excluded = { voided: { count: 0, value: 0 }, cancelled: { count: 0, value: 0 } };
  const rows: unknown[] = [];

  for (const order of orders) {
    const bill = order.bill!;
    const billedAt = order.billedAt ?? order.checkoutTime ?? null;
    const voided = !!order.voidedAt;
    const cancelled = !voided && order.status === "cancelled";
    if (voided || cancelled) {
      const bucket = voided ? excluded.voided : excluded.cancelled;
      bucket.count += 1;
      bucket.value = round2(bucket.value + bill.grandTotal);
    }

    const taxLines = bill.taxLines ?? [];
    const gst = round2(taxLines.reduce((sum, t) => sum + t.amount, 0));
    const rate = round2(taxLines.reduce((sum, t) => sum + t.percent, 0));

    rows.push({
      orderId: order._id,
      invoiceNumber: order.invoiceNumber ?? null,
      legacy: !order.invoiceNumber,
      billedAt,
      customerName: order.customerName,
      customerGstin: order.customerGstin ?? "",
      orderType: order.orderType,
      source: order.source ?? null,
      status: voided ? "voided" : cancelled ? "cancelled" : order.status === "closed" ? "paid" : "unpaid",
      paymentMethod: order.paymentMethod,
      subtotal: round2(bill.subtotal),
      discount: round2(bill.discount ?? 0),
      serviceCharge: round2(bill.serviceCharge ?? 0),
      packagingCharge: round2(bill.packagingCharge ?? 0),
      taxableValue: round2(bill.taxableAmount),
      taxLines: taxLines.map((t) => ({ name: t.name, percent: t.percent, amount: round2(t.amount) })),
      gst,
      roundOff: round2(bill.roundOff ?? 0),
      grandTotal: round2(bill.grandTotal),
      placeOfSupply: bill.placeOfSupply || "",
      sac: bill.sac || "",
    });
    if (voided || cancelled) continue;

    const add = (t: Totals) => {
      t.invoices += 1;
      t.grossSales += bill.subtotal;
      t.discounts += bill.discount ?? 0;
      t.serviceCharge += bill.serviceCharge ?? 0;
      t.packaging += bill.packagingCharge ?? 0;
      t.taxableValue += bill.taxableAmount;
      t.gst += gst;
      t.roundOff += bill.roundOff ?? 0;
      t.invoiceValue += bill.grandTotal;
    };
    add(summary);
    add(order.customerGstin ? b2b : b2c);

    const date = billedAt
      ? businessDateLabel(new Date(billedAt), restaurant?.dayEndTime, restaurant?.timezone)
      : input.from;
    const day = byDay.get(date) ?? emptyTotals();
    add(day);
    byDay.set(date, day);

    for (const line of taxLines) {
      const key = `${line.name}|${line.percent}`;
      const entry = byComponent.get(key) ?? {
        name: line.name,
        percent: line.percent,
        taxableValue: 0,
        amount: 0,
        invoices: 0,
      };
      entry.taxableValue += line.base;
      entry.amount += line.amount;
      entry.invoices += 1;
      byComponent.set(key, entry);
    }
    const slab = bySlab.get(rate) ?? { rate, taxableValue: 0, gst: 0, invoices: 0 };
    slab.taxableValue += bill.taxableAmount;
    slab.gst += gst;
    slab.invoices += 1;
    bySlab.set(rate, slab);
  }

  return {
    from: input.from,
    to: input.to,
    gstin: restaurant?.gstin ?? "",
    summary: roundTotals(summary),
    b2b: roundTotals(b2b),
    b2c: roundTotals(b2c),
    byComponent: [...byComponent.values()]
      .sort((a, b) => a.name.localeCompare(b.name) || a.percent - b.percent)
      .map((c) => ({ ...c, taxableValue: round2(c.taxableValue), amount: round2(c.amount) })),
    bySlab: [...bySlab.values()]
      .sort((a, b) => a.rate - b.rate)
      .map((s) => ({ ...s, taxableValue: round2(s.taxableValue), gst: round2(s.gst) })),
    byDay: [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, t]) => ({ date, ...roundTotals(t) })),
    excluded,
    // Money given back after sale. It is shown here, not taken off the totals above: file a credit note for it.
    refunds: { count: refunds.count, amount: round2(refunds.amount) },
    invoices: rows,
  };
}
