import { Request, Response } from "express";
import { Types } from "mongoose";
import Order, { DeliveryProvider, OrderStatus, OrderType, PaymentMethod } from "../models/Order";
import OrderItem from "../models/OrderItem";
import TableModel from "../models/Table";
import FoodItem from "../models/FoodItem";
import Restaurant from "../models/Restaurant";
import Coupon from "../models/Coupon";
import ChatMessage from "../models/ChatMessage";
import Admin from "../models/Admin";
import { asyncHandler } from "../middleware/errorHandler";
import { HttpError } from "../utils/httpError";
import { computeInvoiceTotals } from "../utils/invoice";
import { findValidCoupon, computeDiscountAmount } from "../utils/coupon";
import { streamInvoicePdf, streamKotPdf, streamOrdersReportPdf } from "../utils/pdf";
import { nextTokenNumber } from "../utils/kotQueue";
import { signToken } from "../utils/jwt";
import { getBusinessDayStart, getBusinessDayRangeForDate } from "../utils/businessDay";
import { moderateMessage } from "../utils/chatModeration";
import { writeAudit } from "../utils/audit";

function validId(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(400, "Invalid id");
}

async function getOwnedOrder(req: Request, orderId: string) {
  validId(orderId);
  const order = await Order.findOne({ _id: orderId, restaurantId: req.restaurantId });
  if (!order) throw new HttpError(404, "Order not found");
  if (req.auth!.role === "table" && req.auth!.orderId !== orderId) {
    throw new HttpError(403, "This order does not belong to your table session");
  }
  return order;
}

// ---------- Starting orders ----------

export const startDineInOrder = asyncHandler(async (req: Request, res: Response) => {
  const { customerName, customerPhone, members } = req.body as {
    customerName?: string;
    customerPhone?: string;
    members?: number;
  };
  if (!customerName) throw new HttpError(400, "customerName is required");
  if (!req.auth!.tableId) throw new HttpError(400, "No table session found");

  const table = await TableModel.findOne({ _id: req.auth!.tableId, restaurantId: req.restaurantId });
  if (!table) throw new HttpError(404, "Table not found");

  const order = await Order.create({
    restaurantId: req.restaurantId,
    orderType: "dine-in",
    tableId: table._id,
    customerName,
    customerPhone: customerPhone || "",
    members: members || 1,
    status: "open",
  });

  const token = signToken({
    role: "table",
    restaurantId: req.restaurantId!,
    id: req.auth!.id,
    tableId: table._id.toString(),
    orderId: order._id.toString(),
    // Carried over, or this replacement token would fail the seating check.
    sessionId: req.auth!.sessionId,
  });

  res.status(201).json({ token, order });
});

export const startDeliveryOrder = asyncHandler(async (req: Request, res: Response) => {
  const { provider, customerName, customerPhone, members } = req.body as {
    provider?: DeliveryProvider;
    customerName?: string;
    customerPhone?: string;
    members?: number;
  };
  const validProviders: DeliveryProvider[] = ["Swiggy", "Zomato", "Uber-Eats", "Other"];
  if (!provider || !validProviders.includes(provider)) throw new HttpError(400, "A valid provider is required");
  if (!customerName) throw new HttpError(400, "customerName is required");

  const order = await Order.create({
    restaurantId: req.restaurantId,
    orderType: "delivery",
    deliveryProvider: provider,
    source: "counter",
    customerName,
    customerPhone: customerPhone || "",
    members: members || 1,
    status: "open",
  });

  res.status(201).json(order);
});

/**
 * Counter order taken by staff. Unlike the guest flow this issues no table token -
 * the order is worked from the admin panel - so a regular table is marked occupied
 * here and freed when the order is paid or cancelled.
 */
export const startTakeawayOrder = asyncHandler(async (req: Request, res: Response) => {
  const { customerName, customerPhone, members } = req.body as {
    customerName?: string;
    customerPhone?: string;
    members?: number;
  };
  if (!customerName) throw new HttpError(400, "customerName is required");

  // No table and no provider - it is collected at the counter.
  const order = await Order.create({
    restaurantId: req.restaurantId,
    orderType: "takeaway",
    source: "counter",
    customerName,
    customerPhone: customerPhone || "",
    members: members || 1,
    status: "open",
  });

  res.status(201).json(order);
});

export const startCounterOrder = asyncHandler(async (req: Request, res: Response) => {
  const { tableId, customerName, customerPhone, members, allowOccupied } = req.body as {
    tableId?: string;
    customerName?: string;
    customerPhone?: string;
    members?: number;
    allowOccupied?: boolean;
  };
  if (!customerName) throw new HttpError(400, "customerName is required");

  // A table is optional: staff taking an order at the counter don't assign one.
  let table = null;
  if (tableId) {
    validId(tableId);
    table = await TableModel.findOne({ _id: tableId, restaurantId: req.restaurantId });
    if (!table) throw new HttpError(404, "Table not found");
    // Staff can deliberately open a second order on a seated table (a split bill, or a
    // party that joins later); without the flag an accidental duplicate is still blocked.
    if (!table.isGuest && table.status === "occupied" && !allowOccupied) {
      throw new HttpError(409, "This table is already occupied");
    }
  }

  const order = await Order.create({
    restaurantId: req.restaurantId,
    orderType: "dine-in",
    ...(table && { tableId: table._id }),
    source: "counter",
    customerName,
    customerPhone: customerPhone || "",
    members: members || 1,
    status: "open",
  });

  if (table && !table.isGuest) {
    table.status = "occupied";
    table.occupiedAt = new Date();
    await table.save();
  }

  res.status(201).json(order);
});

// ---------- Order items (cart confirmation) ----------

export const addOrderItems = asyncHandler(async (req: Request, res: Response) => {
  const order = await getOwnedOrder(req, req.params.orderId);
  if (order.status !== "open") throw new HttpError(409, "This order is no longer open");

  const { items } = req.body as {
    items?: {
      foodItemId: string;
      quantity: number;
      isJain?: boolean;
      note?: string;
      modifiers?: { groupName: string; label: string }[];
    }[];
  };
  if (!Array.isArray(items) || items.length === 0) throw new HttpError(400, "items must be a non-empty array");

  const created = [];
  let longestPrepMinutes = 0;
  for (const line of items) {
    if (!line.foodItemId || !Types.ObjectId.isValid(line.foodItemId)) throw new HttpError(400, "Invalid foodItemId");
    if (!line.quantity || line.quantity < 1) throw new HttpError(400, "quantity must be at least 1");

    // Server always re-derives price from the current menu record; the client's
    // displayed price is never trusted for the amount actually charged.
    const food = await FoodItem.findOne({ _id: line.foodItemId, restaurantId: req.restaurantId, isActive: true });
    if (!food) throw new HttpError(404, `Food item ${line.foodItemId} is not available`);

    // Resolve chosen modifiers against the dish's real groups so the price delta can't be spoofed.
    const chosen: { groupName: string; label: string; priceDelta: number }[] = [];
    if (Array.isArray(line.modifiers)) {
      for (const sel of line.modifiers) {
        const group = (food.modifierGroups || []).find((g) => g.name === sel?.groupName);
        const option = group?.options.find((o) => o.label === sel?.label);
        if (group && option) chosen.push({ groupName: group.name, label: option.label, priceDelta: option.priceDelta });
      }
    }
    const unitPrice = round2(food.price + chosen.reduce((sum, m) => sum + m.priceDelta, 0));

    const orderItem = await OrderItem.create({
      restaurantId: req.restaurantId,
      orderId: order._id,
      foodItemId: food._id,
      foodName: food.name,
      unitPrice,
      quantity: line.quantity,
      total: round2(unitPrice * line.quantity),
      isJain: !!line.isJain,
      modifiers: chosen,
      note: typeof line.note === "string" ? line.note.trim().slice(0, 200) : "",
      status: "pending",
      kotRound: null,
    });
    created.push(orderItem);
    longestPrepMinutes = Math.max(longestPrepMinutes, food.prepTimeMinutes ?? 0);
  }

  // The kitchen works a round in parallel, so the round's slowest dish sets its pace.
  // Later rounds only start when they arrive, so the estimate can move out but never in.
  const restaurant = await Restaurant.findById(req.restaurantId).select("prepBufferMinutes");
  const buffer = restaurant?.prepBufferMinutes ?? 0;
  const roundReadyAt = new Date(Date.now() + (longestPrepMinutes + buffer) * 60 * 1000);
  if (!order.estimatedReadyAt || roundReadyAt > order.estimatedReadyAt) {
    order.estimatedReadyAt = roundReadyAt;
    await order.save();
  }

  res.status(201).json(created);
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const startPreparingItem = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.itemId);
  const item = await OrderItem.findOneAndUpdate(
    { _id: req.params.itemId, restaurantId: req.restaurantId, status: "pending", kotRound: { $ne: null } },
    { $set: { status: "preparing" } },
    { new: true }
  );
  if (!item) throw new HttpError(404, "Item not found, already in progress, or not yet sent to the kitchen");
  res.json(item);
});

export const markItemReady = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.itemId);
  const item = await OrderItem.findOneAndUpdate(
    { _id: req.params.itemId, restaurantId: req.restaurantId, status: "preparing" },
    { $set: { status: "ready", readyAt: new Date() } },
    { new: true }
  );
  if (!item) throw new HttpError(404, "Item is not currently preparing");
  res.json(item);
});

export const serveOrderItem = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.itemId);
  const item = await OrderItem.findOneAndUpdate(
    { _id: req.params.itemId, restaurantId: req.restaurantId, status: { $in: ["pending", "preparing", "ready"] } },
    { $set: { status: "served" } },
    { new: true }
  );
  if (!item) throw new HttpError(404, "Order item not found or already served/cancelled");
  res.json(item);
});

export const cancelOrderItem = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.itemId);
  const item = await OrderItem.findOneAndUpdate(
    { _id: req.params.itemId, restaurantId: req.restaurantId, status: { $ne: "cancelled" } },
    { $set: { status: "cancelled" } },
    { new: true }
  );
  if (!item) throw new HttpError(404, "Order item not found");
  await writeAudit(req, "orderItem.cancel", `Cancelled item "${item.foodName}" x${item.quantity}`);
  res.json(item);
});

// ---------- Order lifecycle ----------

/** Turns the shared type/status/date query params into a Mongo filter (used by the list and the reports). */
async function buildOrderFilter(req: Request): Promise<Record<string, unknown>> {
  const { type, status, today, from, to } = req.query as {
    type?: OrderType;
    status?: OrderStatus;
    today?: string;
    from?: string;
    to?: string;
  };

  const filter: Record<string, unknown> = { restaurantId: req.restaurantId };
  if (type) filter.orderType = type;
  if (status) filter.status = status;

  if (today === "true") {
    const restaurant = await Restaurant.findById(req.restaurantId).select("dayEndTime timezone");
    filter.checkinTime = { $gte: getBusinessDayStart(new Date(), restaurant?.dayEndTime, restaurant?.timezone) };
  } else if (from || to) {
    // "from"/"to" are calendar-date labels (YYYY-MM-DD); each one names a full business day,
    // so late-night orders that spill past midnight (before the day-end cutoff) are still
    // included in the day they were labeled with, not cut off at literal midnight.
    const restaurant = await Restaurant.findById(req.restaurantId).select("dayEndTime timezone");
    const range: Record<string, Date> = {};
    if (from) range.$gte = getBusinessDayRangeForDate(from, restaurant?.dayEndTime, restaurant?.timezone).start;
    if (to) range.$lt = getBusinessDayRangeForDate(to, restaurant?.dayEndTime, restaurant?.timezone).end;
    filter.checkinTime = range;
  }
  return filter;
}

export const listOrders = asyncHandler(async (req: Request, res: Response) => {
  const filter = await buildOrderFilter(req);
  const orders = await Order.find(filter).sort({ checkinTime: -1 }).populate("tableId", "code").lean();

  // Attach a small kitchen summary per order so the dashboard/list can show KOT progress
  // without a separate request per order.
  const orderIds = orders.map((o) => o._id);
  const items = await OrderItem.find({ orderId: { $in: orderIds } }).select("orderId status kotRound").lean();
  const byOrder = new Map<string, { active: number; served: number; ready: number; preparing: number; pendingSent: number; pendingUnsent: number }>();
  for (const it of items) {
    const key = it.orderId.toString();
    const k = byOrder.get(key) ?? { active: 0, served: 0, ready: 0, preparing: 0, pendingSent: 0, pendingUnsent: 0 };
    if (it.status !== "cancelled") k.active += 1;
    if (it.status === "served") k.served += 1;
    else if (it.status === "ready") k.ready += 1;
    else if (it.status === "preparing") k.preparing += 1;
    else if (it.status === "pending") (it.kotRound != null ? (k.pendingSent += 1) : (k.pendingUnsent += 1));
    byOrder.set(key, k);
  }

  const withKitchen = orders.map((o) => ({
    ...o,
    kitchen: byOrder.get(o._id.toString()) ?? { active: 0, served: 0, ready: 0, preparing: 0, pendingSent: 0, pendingUnsent: 0 },
  }));
  res.json(withKitchen);
});

/**
 * Permanently deletes every order matching the current filters (type/status/date) along
 * with their items and chat. This is a bulk, irreversible clear, so it is restricted to
 * the owner account regardless of who else has "edit" on Orders. Any tables those orders
 * held are freed so the deletion doesn't strand a table as "occupied".
 */
export const clearOrders = asyncHandler(async (req: Request, res: Response) => {
  const admin = req.admin ?? (await Admin.findById(req.auth!.id));
  if (!admin?.isOwner) {
    throw new HttpError(403, "Only the owner account can clear orders");
  }

  const filter = await buildOrderFilter(req);
  const orders = await Order.find(filter).select("_id tableId orderType");
  if (orders.length === 0) return res.json({ deleted: 0 });

  const orderIds = orders.map((o) => o._id);
  const tableIds = orders
    .filter((o) => o.orderType === "dine-in" && o.tableId)
    .map((o) => o.tableId as Types.ObjectId);

  await OrderItem.deleteMany({ orderId: { $in: orderIds } });
  await ChatMessage.deleteMany({ orderId: { $in: orderIds } });
  await Order.deleteMany({ _id: { $in: orderIds } });
  if (tableIds.length > 0) {
    await TableModel.updateMany(
      { _id: { $in: tableIds }, isGuest: false },
      { $set: { status: "available" }, $unset: { sessionId: "", occupiedAt: "" } }
    );
  }

  const { type } = req.query as { type?: string };
  await writeAudit(req, "order.clear", `Cleared ${orderIds.length} ${type || "all"} order(s)`);
  res.json({ deleted: orderIds.length });
});

interface OrderReportRow {
  order: import("../models/Order").IOrder & { tableId?: { code?: string } };
  grandTotal: number;
}

/**
 * Loads the filtered orders plus a computed grand total for each, in two queries
 * (orders, then all their items at once) rather than per-order, so a big date range
 * doesn't fan out into hundreds of round-trips.
 */
async function buildOrderReport(req: Request): Promise<{ rows: OrderReportRow[]; total: number; count: number }> {
  const filter = await buildOrderFilter(req);
  const orders = await Order.find(filter).sort({ checkinTime: -1 }).populate("tableId", "code").lean();
  const restaurant = await Restaurant.findById(req.restaurantId).select("taxRates");
  const taxRates = restaurant?.taxRates || [];

  const orderIds = orders.map((o) => o._id);
  const items = await OrderItem.find({ orderId: { $in: orderIds } }).select("orderId status total").lean();
  const itemsByOrder = new Map<string, { status: string; total: number }[]>();
  for (const it of items) {
    const key = it.orderId.toString();
    if (!itemsByOrder.has(key)) itemsByOrder.set(key, []);
    itemsByOrder.get(key)!.push(it);
  }

  let total = 0;
  const rows: OrderReportRow[] = orders.map((order) => {
    const orderItems = itemsByOrder.get(order._id.toString()) || [];
    // A cancelled order collects no money, so it reports as 0 regardless of items.
    const grandTotal =
      order.status === "cancelled" ? 0 : computeInvoiceTotals(orderItems as any, taxRates, order.discountAmount).grandTotal;
    total += grandTotal;
    return { order: order as OrderReportRow["order"], grandTotal };
  });
  return { rows, total: Math.round(total * 100) / 100, count: rows.length };
}

function orderTypeLabel(order: { orderType: string; deliveryProvider?: string }): string {
  if (order.orderType === "delivery") return `Delivery (${order.deliveryProvider || "?"})`;
  if (order.orderType === "takeaway") return "Take away";
  return "Dine-in";
}

/** Escapes a value for CSV: wrap in quotes and double any inner quotes. */
function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function reportFilename(req: Request, ext: string): string {
  const { type, from, to, today } = req.query as Record<string, string>;
  const generatedOn = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const range = today === "true" ? "today" : [from, to].filter(Boolean).join("_");
  const parts = ["orders", type || "all", range, generatedOn].filter(Boolean);
  return `${parts.join("-")}.${ext}`;
}

export const exportOrdersCsv = asyncHandler(async (req: Request, res: Response) => {
  const { rows, total, count } = await buildOrderReport(req);
  const header = ["Customer", "Phone", "Type", "Check-in", "Members", "Status", "Payment", "Coupon", "Total"];
  const lines = [header.map(csvCell).join(",")];
  for (const { order, grandTotal } of rows) {
    lines.push(
      [
        order.customerName,
        order.customerPhone || "",
        order.tableId?.code ? `${orderTypeLabel(order)} - ${order.tableId.code}` : orderTypeLabel(order),
        new Date(order.checkinTime).toISOString(),
        order.members,
        order.status,
        order.paymentMethod,
        order.couponCode || "",
        grandTotal.toFixed(2),
      ]
        .map(csvCell)
        .join(",")
    );
  }
  lines.push(["", "", "", "", "", "", "", csvCell(`Total (${count})`), csvCell(total.toFixed(2))].join(","));

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${reportFilename(req, "csv")}"`);
  res.send("﻿" + lines.join("\r\n")); // BOM so Excel reads UTF-8 correctly
});

export const exportOrdersPdf = asyncHandler(async (req: Request, res: Response) => {
  const restaurant = await Restaurant.findById(req.restaurantId);
  if (!restaurant) throw new HttpError(404, "Restaurant not found");
  const { rows, total, count } = await buildOrderReport(req);
  const { type, from, to, today } = req.query as Record<string, string>;
  const rangeLabel =
    today === "true" ? "Today" : from || to ? [from, to].filter(Boolean).join(" to ") : "All dates";

  await streamOrdersReportPdf(res, {
    restaurant,
    filename: reportFilename(req, "pdf"),
    title: `Orders report - ${type ? orderTypeLabel({ orderType: type }) : "All types"}`,
    rangeLabel,
    rows: rows.map(({ order, grandTotal }) => ({
      customer: order.customerName,
      type: order.tableId?.code ? `${orderTypeLabel(order)} (${order.tableId.code})` : orderTypeLabel(order),
      checkin: new Date(order.checkinTime).toLocaleString(),
      status: order.status,
      payment: order.paymentMethod,
      total: grandTotal,
    })),
    total,
    count,
  });
});

export const getOrder = asyncHandler(async (req: Request, res: Response) => {
  const order = await getOwnedOrder(req, req.params.orderId);
  const items = await OrderItem.find({ orderId: order._id }).sort({ kotRound: 1, createdAt: 1 });
  const restaurant = await Restaurant.findById(req.restaurantId);
  const totals = computeInvoiceTotals(items, restaurant?.taxRates || [], order.discountAmount);
  // The template is filled in client-side so {time} lands in the reader's own timezone.
  res.json({ order, items, totals, prepMessageTemplate: restaurant?.prepMessageTemplate || "", prepBufferMinutes: restaurant?.prepBufferMinutes ?? 2 });
});

export const getInvoice = asyncHandler(async (req: Request, res: Response) => {
  const order = await getOwnedOrder(req, req.params.orderId);
  const items = await OrderItem.find({ orderId: order._id });
  const restaurant = await Restaurant.findById(req.restaurantId);
  const totals = computeInvoiceTotals(items, restaurant?.taxRates || [], order.discountAmount);
  res.json({ order, items, totals, prepMessageTemplate: restaurant?.prepMessageTemplate || "", prepBufferMinutes: restaurant?.prepBufferMinutes ?? 2 });
});

export const getInvoicePdf = asyncHandler(async (req: Request, res: Response) => {
  const order = await getOwnedOrder(req, req.params.orderId);
  const items = await OrderItem.find({ orderId: order._id });
  const restaurant = await Restaurant.findById(req.restaurantId);
  if (!restaurant) throw new HttpError(404, "Restaurant not found");
  const totals = computeInvoiceTotals(items, restaurant.taxRates, order.discountAmount);
  await streamInvoicePdf(res, { restaurant, order, items, totals });
});

// ---------- Coupons ----------

/**
 * Coupons staff can offer on this order. Lives on the orders module rather than the
 * coupons one, so someone who only takes orders can still see what's available, and
 * each is scored against this order's subtotal so unusable ones say why.
 */
export const listOrderCoupons = asyncHandler(async (req: Request, res: Response) => {
  const order = await getOwnedOrder(req, req.params.orderId);
  const items = await OrderItem.find({ orderId: order._id });
  const restaurant = await Restaurant.findById(req.restaurantId);
  if (!restaurant) throw new HttpError(404, "Restaurant not found");
  const { subtotal } = computeInvoiceTotals(items, restaurant.taxRates, 0);

  const coupons = await Coupon.find({ restaurantId: req.restaurantId, isActive: true }).sort({ code: 1 });
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
    // Best saving first, and anything unusable drops below it.
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.discount - a.discount);

  res.json({ subtotal, coupons: usable });
});

export const applyCoupon = asyncHandler(async (req: Request, res: Response) => {
  const order = await getOwnedOrder(req, req.params.orderId);
  if (order.status !== "open") throw new HttpError(409, "A coupon can only be applied to an open order");

  const { code } = req.body as { code?: string };
  if (!code) throw new HttpError(400, "code is required");
  const normalized = code.trim().toUpperCase();

  const items = await OrderItem.find({ orderId: order._id });
  const subtotal = items.filter((i) => i.status !== "cancelled").reduce((sum, i) => sum + i.total, 0);

  const coupon = await findValidCoupon(req.restaurantId!, normalized, subtotal);
  const discountAmount = computeDiscountAmount(coupon, subtotal);

  const previousCode = order.couponCode;
  if (previousCode && previousCode !== coupon.code) {
    await Coupon.updateOne({ restaurantId: req.restaurantId, code: previousCode }, { $inc: { usedCount: -1 } });
  }
  if (previousCode !== coupon.code) {
    await Coupon.updateOne({ _id: coupon._id }, { $inc: { usedCount: 1 } });
  }

  order.couponCode = coupon.code;
  order.discountAmount = discountAmount;
  await order.save();

  const totals = computeInvoiceTotals(items, (await Restaurant.findById(req.restaurantId))?.taxRates || [], discountAmount);
  res.json({ order, totals });
});

export const removeCoupon = asyncHandler(async (req: Request, res: Response) => {
  const order = await getOwnedOrder(req, req.params.orderId);
  if (order.status !== "open") throw new HttpError(409, "A coupon can only be changed on an open order");

  if (order.couponCode) {
    await Coupon.updateOne({ restaurantId: req.restaurantId, code: order.couponCode }, { $inc: { usedCount: -1 } });
  }
  order.couponCode = undefined;
  order.discountAmount = 0;
  await order.save();

  const items = await OrderItem.find({ orderId: order._id });
  const totals = computeInvoiceTotals(items, (await Restaurant.findById(req.restaurantId))?.taxRates || [], 0);
  res.json({ order, totals });
});

export const payOrder = asyncHandler(async (req: Request, res: Response) => {
  const order = await getOwnedOrder(req, req.params.orderId);
  const { paymentMethod } = req.body as { paymentMethod?: PaymentMethod };
  const validMethods: PaymentMethod[] = ["cash", "online", "card"];
  if (!paymentMethod || !validMethods.includes(paymentMethod)) {
    throw new HttpError(400, "A valid paymentMethod (cash, online, card) is required");
  }
  if (order.status !== "open") throw new HttpError(409, "This order is not open");

  order.status = "closed";
  order.paymentMethod = paymentMethod;
  order.checkoutTime = new Date();
  await order.save();

  if (order.orderType === "dine-in" && order.tableId) {
    await TableModel.findByIdAndUpdate(order.tableId, { $set: { status: "available" }, $unset: { sessionId: "", occupiedAt: "" } });
  }

  await writeAudit(req, "order.pay", `Closed & paid order for ${order.customerName || "guest"} (${paymentMethod})`);
  res.json(order);
});

export const cancelOrder = asyncHandler(async (req: Request, res: Response) => {
  const order = await getOwnedOrder(req, req.params.orderId);
  if (order.status === "closed") throw new HttpError(409, "A closed order cannot be cancelled");

  order.status = "cancelled";
  await order.save();
  await OrderItem.updateMany({ orderId: order._id, status: "pending" }, { $set: { status: "cancelled" } });

  if (order.orderType === "dine-in" && order.tableId) {
    await TableModel.findByIdAndUpdate(order.tableId, { $set: { status: "available" }, $unset: { sessionId: "", occupiedAt: "" } });
  }

  await writeAudit(req, "order.cancel", `Cancelled order for ${order.customerName || "guest"}`);
  res.json(order);
});

// ---------- KOT (kitchen queue) ----------

export const getKotQueue = asyncHandler(async (req: Request, res: Response) => {
  const { tableId } = req.query as { tableId?: string };
  const orderFilter: Record<string, unknown> = { restaurantId: req.restaurantId, status: "open" };
  if (tableId) {
    validId(tableId);
    orderFilter.tableId = tableId;
  }

  const orders = await Order.find(orderFilter).populate("tableId", "code");
  const orderIds = orders.map((o) => o._id);
  const items = await OrderItem.find({
    orderId: { $in: orderIds },
    status: { $in: ["pending", "preparing", "ready"] },
  }).sort({ createdAt: 1 });

  const grouped = orders
    .map((order) => {
      const orderItems = items.filter((i) => i.orderId.toString() === order._id.toString());
      const numbers = orderItems.map((i) => i.tokenNumber).filter((n): n is number => typeof n === "number");
      return { order, items: orderItems, tokenNumber: numbers.length ? Math.min(...numbers) : null };
    })
    .filter((g) => g.items.length > 0)
    // Kitchen works the queue in order; anything not sent yet trails the printed tickets.
    .sort((a, b) => (a.tokenNumber ?? Number.MAX_SAFE_INTEGER) - (b.tokenNumber ?? Number.MAX_SAFE_INTEGER));

  res.json(grouped);
});

export const printKot = asyncHandler(async (req: Request, res: Response) => {
  const order = await getOwnedOrder(req, req.params.orderId);
  const pending = await OrderItem.find({ orderId: order._id, status: "pending", kotRound: null });
  if (pending.length === 0) {
    return res.json({ round: null, items: [], message: "No new items to send to the kitchen" });
  }

  const lastRound = await OrderItem.findOne({ orderId: order._id, kotRound: { $ne: null } }).sort({ kotRound: -1 });
  const round = (lastRound?.kotRound || 0) + 1;

  const restaurant = await Restaurant.findById(req.restaurantId).select("dayEndTime timezone");
  const { tokenNumber } = await nextTokenNumber(req.restaurantId!, restaurant?.dayEndTime, restaurant?.timezone);

  await OrderItem.updateMany(
    { _id: { $in: pending.map((p) => p._id) } },
    { $set: { kotRound: round, tokenNumber, kotPrintedAt: new Date() } }
  );

  const updated = await OrderItem.find({ orderId: order._id, kotRound: round });
  res.json({ round, tokenNumber, items: updated });
});

export const getKotPdf = asyncHandler(async (req: Request, res: Response) => {
  const order = await getOwnedOrder(req, req.params.orderId);
  const round = Number(req.params.round);
  const items = await OrderItem.find({ orderId: order._id, kotRound: round });
  if (items.length === 0) throw new HttpError(404, "No KOT ticket found for that round");
  const restaurant = await Restaurant.findById(req.restaurantId);
  if (!restaurant) throw new HttpError(404, "Restaurant not found");

  let tableCode: string | undefined;
  if (order.orderType === "dine-in" && order.tableId) {
    const table = await TableModel.findById(order.tableId).select("code");
    tableCode = table?.code;
  }

  await streamKotPdf(res, { restaurant, order, round, items, tableCode, tokenNumber: items[0]?.tokenNumber ?? null });
});

// ---------- Chat (table <-> admin) ----------

export const listActiveChats = asyncHandler(async (req: Request, res: Response) => {
  const grouped = await ChatMessage.aggregate([
    { $match: { restaurantId: new Types.ObjectId(req.restaurantId) } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: "$orderId",
        lastMessage: { $first: "$message" },
        lastSenderRole: { $first: "$senderRole" },
        lastAt: { $first: "$createdAt" },
        unreadCount: {
          $sum: {
            $cond: [{ $and: [{ $eq: ["$senderRole", "table"] }, { $eq: ["$readByAdmin", false] }] }, 1, 0],
          },
        },
      },
    },
    { $sort: { lastAt: -1 } },
    { $limit: 50 },
  ]);

  const orderIds = grouped.map((g) => g._id);
  const orders = await Order.find({ _id: { $in: orderIds } }).populate("tableId", "code");
  const orderById = new Map(orders.map((o) => [o._id.toString(), o]));

  const conversations = grouped
    .filter((g) => orderById.has(g._id.toString()))
    .map((g) => ({
      orderId: g._id,
      order: orderById.get(g._id.toString()),
      lastMessage: g.lastMessage,
      lastSenderRole: g.lastSenderRole,
      lastAt: g.lastAt,
      unreadCount: g.unreadCount,
    }));

  res.json(conversations);
});

export const getChatMessages = asyncHandler(async (req: Request, res: Response) => {
  const order = await getOwnedOrder(req, req.params.orderId);
  const messages = await ChatMessage.find({ orderId: order._id }).sort({ createdAt: 1 });

  const role = req.auth!.role;
  if (role === "admin") {
    await ChatMessage.updateMany(
      { orderId: order._id, senderRole: "table", readByAdmin: false },
      { $set: { readByAdmin: true } }
    );
  } else if (role === "table") {
    await ChatMessage.updateMany(
      { orderId: order._id, senderRole: "admin", readByTable: false },
      { $set: { readByTable: true } }
    );
  }

  res.json(messages);
});

export const sendChatMessage = asyncHandler(async (req: Request, res: Response) => {
  const order = await getOwnedOrder(req, req.params.orderId);
  const { message } = req.body as { message?: string };
  if (!message || !message.trim()) throw new HttpError(400, "message is required");

  const role = req.auth!.role;
  if (role !== "admin" && role !== "table") throw new HttpError(403, "Only table and admin can send chat messages");

  const senderName = role === "admin" ? "Restaurant" : order.customerName || "Guest";

  // Run the abuse/violence filter before storing. Block mode rejects outright; mask mode
  // stores a cleaned copy and flags it so staff can see something was filtered.
  const restaurant = await Restaurant.findById(req.restaurantId).select("chatModeration");
  const moderation = restaurant?.chatModeration ?? { enabled: true, mode: "mask" as const, customWords: [] };
  const { clean, flagged } = moderateMessage(message.trim(), moderation);
  if (flagged && moderation.mode === "block") {
    throw new HttpError(400, "Your message contains language that isn't allowed. Please rephrase and try again.");
  }

  const chatMessage = await ChatMessage.create({
    restaurantId: req.restaurantId,
    orderId: order._id,
    senderRole: role,
    senderName,
    message: clean,
    flagged,
    readByAdmin: role === "admin",
    readByTable: role === "table",
  });

  res.status(201).json(chatMessage);
});

export const deleteChatMessage = asyncHandler(async (req: Request, res: Response) => {
  const message = await ChatMessage.findOne({
    _id: req.params.messageId,
    restaurantId: req.restaurantId,
  });
  if (!message) throw new HttpError(404, "Message not found");

  await ChatMessage.deleteOne({ _id: message._id });
  res.json({ message: "Message deleted" });
});

/** Clears the unread badge without opening every conversation one by one. */
export const markAllChatsRead = asyncHandler(async (req: Request, res: Response) => {
  const result = await ChatMessage.updateMany(
    { restaurantId: req.restaurantId, senderRole: "table", readByAdmin: false },
    { $set: { readByAdmin: true } }
  );
  res.json({ message: "All messages marked as read", updated: result.modifiedCount });
});
