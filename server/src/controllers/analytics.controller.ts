import { Request, Response } from "express";

import { asyncHandler } from "../middleware/errorHandler";
import AuditLog from "../models/AuditLog";
import FoodItem from "../models/FoodItem";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import Restaurant from "../models/Restaurant";
import { HttpError } from "../utils/httpError";
import { computeInvoiceTotals } from "../utils/invoice";

const DEFAULT_TZ = "Asia/Kolkata";

function localParts(at: Date, timeZone: string): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) % 24 || 0 };
}

export const getSalesAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const days = Math.min(90, Math.max(1, Number((req.query as { days?: string }).days) || 14));
  const restaurant = await Restaurant.findById(req.restaurantId).select("taxRates timezone");
  const tz = restaurant?.timezone || DEFAULT_TZ;
  const taxRates = restaurant?.taxRates || [];

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const orders = await Order.find({
    restaurantId: req.restaurantId,
    status: "closed",
    checkoutTime: { $gte: since },
  })
    .select("orderType checkoutTime discountAmount")
    .lean();

  const orderIds = orders.map((o) => o._id);
  const items = await OrderItem.find({ orderId: { $in: orderIds } })
    .select("orderId status total foodName quantity")
    .lean();
  const itemsByOrder = new Map<string, { status: string; total: number }[]>();
  for (const it of items) {
    const key = it.orderId.toString();
    if (!itemsByOrder.has(key)) itemsByOrder.set(key, []);
    itemsByOrder.get(key)!.push(it);
  }

  const byDay = new Map<string, { revenue: number; orders: number }>();
  const byHour = Array.from({ length: 24 }, () => ({ revenue: 0, orders: 0 }));
  const byType = new Map<string, { revenue: number; orders: number }>();
  let totalRevenue = 0;

  for (const o of orders) {
    const grand = computeInvoiceTotals(
      itemsByOrder.get(o._id.toString()) as any,
      taxRates,
      o.discountAmount
    ).grandTotal;
    totalRevenue += grand;
    const when = o.checkoutTime ? new Date(o.checkoutTime) : new Date();
    const { date, hour } = localParts(when, tz);
    const d = byDay.get(date) ?? { revenue: 0, orders: 0 };
    d.revenue += grand;
    d.orders += 1;
    byDay.set(date, d);
    byHour[hour].revenue += grand;
    byHour[hour].orders += 1;
    const t = byType.get(o.orderType) ?? { revenue: 0, orders: 0 };
    t.revenue += grand;
    t.orders += 1;
    byType.set(o.orderType, t);
  }

  // Top dishes by quantity across the same closed orders.
  const dish = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const it of items) {
    if (it.status === "cancelled") continue;
    const key = it.foodName;
    const d = dish.get(key) ?? { name: it.foodName, qty: 0, revenue: 0 };
    d.qty += it.quantity;
    d.revenue += it.total;
    dish.set(key, d);
  }

  // A continuous day series so the chart has no gaps.
  const dayjs: { date: string; revenue: number; orders: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const { date } = localParts(new Date(Date.now() - i * 24 * 60 * 60 * 1000), tz);
    const d = byDay.get(date) ?? { revenue: 0, orders: 0 };
    dayjs.push({ date, revenue: round2(d.revenue), orders: d.orders });
  }

  res.json({
    days,
    totalRevenue: round2(totalRevenue),
    totalOrders: orders.length,
    byDay: dayjs,
    byHour: byHour.map((h, hour) => ({ hour, revenue: round2(h.revenue), orders: h.orders })),
    byType: Array.from(byType, ([type, v]) => ({ type, revenue: round2(v.revenue), orders: v.orders })),
    topDishes: Array.from(dish.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10)
      .map((d) => ({ name: d.name, qty: d.qty, revenue: round2(d.revenue) })),
  });
});

export const getPrepAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const items = await OrderItem.find({
    restaurantId: req.restaurantId,
    kotPrintedAt: { $ne: null },
    readyAt: { $ne: null },
  })
    .select("foodItemId foodName kotPrintedAt readyAt")
    .lean();

  const agg = new Map<string, { name: string; totalMin: number; count: number }>();
  for (const it of items) {
    if (!it.kotPrintedAt || !it.readyAt) continue;
    const mins = (new Date(it.readyAt).getTime() - new Date(it.kotPrintedAt).getTime()) / 60000;
    if (mins < 0 || mins > 600) continue; // ignore corrupt/absurd spans
    // Aggregator lines have no local menu item, so group those by name instead.
    const key = it.foodItemId ? it.foodItemId.toString() : `name:${it.foodName}`;
    const a = agg.get(key) ?? { name: it.foodName, totalMin: 0, count: 0 };
    a.totalMin += mins;
    a.count += 1;
    agg.set(key, a);
  }

  const foods = await FoodItem.find({ restaurantId: req.restaurantId }).select("name prepTimeMinutes").lean();
  const estimateById = new Map(
    foods.map((f) => [f._id.toString(), { name: f.name, estimate: f.prepTimeMinutes ?? 0 }])
  );

  const rows = Array.from(agg, ([id, a]) => {
    const est = estimateById.get(id);
    const actualAvg = a.count > 0 ? a.totalMin / a.count : 0;
    return {
      name: est?.name || a.name,
      estimate: est?.estimate ?? 0,
      actualAvg: round2(actualAvg),
      samples: a.count,
      diff: round2(actualAvg - (est?.estimate ?? 0)),
    };
  }).sort((a, b) => b.samples - a.samples);

  res.json({ rows });
});

export const getAuditLog = asyncHandler(async (req: Request, res: Response) => {
  const limit = Math.min(500, Math.max(1, Number((req.query as { limit?: string }).limit) || 200));
  const entries = await AuditLog.find({ restaurantId: req.restaurantId }).sort({ createdAt: -1 }).limit(limit).lean();
  res.json(
    entries.map((e) => ({
      _id: e._id,
      actorName: e.actorName,
      action: e.action,
      summary: e.summary,
      createdAt: e.createdAt,
    }))
  );
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
