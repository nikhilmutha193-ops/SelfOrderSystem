import { RequestContext } from "../../core/context";
import { IOrder } from "../../models/Order";
import { IOrderItem } from "../../models/OrderItem";
import { getBusinessDayRangeForDate } from "../../utils/businessDay";
import { HttpError } from "../../utils/httpError";
import { totalsForOrder } from "./orders.billing";
import { OrdersRepository } from "./orders.repository";
import { InvoiceRegisterInput, OrderFilterInput } from "./orders.schema";
import { buildOrderFilter } from "./orders.service";

type ReportOrder = Omit<IOrder, "tableId"> & { tableId?: { code?: string } };

interface OrderReportRow {
  order: ReportOrder;
  grandTotal: number;
}

function orderTypeLabel(order: { orderType: string; deliveryProvider?: string }): string {
  if (order.orderType === "delivery") return `Delivery (${order.deliveryProvider || "?"})`;
  if (order.orderType === "takeaway") return "Take away";
  return "Dine-in";
}

function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export function reportFilename(query: OrderFilterInput, ext: string): string {
  const generatedOn = new Date().toISOString().slice(0, 10);
  const range = query.today === "true" ? "today" : [query.from, query.to].filter(Boolean).join("_");
  const parts = ["orders", query.type || "all", range, generatedOn].filter(Boolean);
  return `${parts.join("-")}.${ext}`;
}

async function buildOrderReport(ctx: RequestContext, query: OrderFilterInput) {
  const repo = new OrdersRepository(ctx.restaurantId);
  const orders = await repo.findOrdersWithTable(await buildOrderFilter(repo, query, { includeArchived: true }));
  const restaurant = await repo.findRestaurant("taxRates");
  const taxRates = restaurant?.taxRates || [];

  const items = await repo.findItemTotals(orders.map((o) => o._id));
  const itemsByOrder = new Map<string, Pick<IOrderItem, "status" | "total">[]>();
  for (const item of items) {
    const key = item.orderId.toString();
    if (!itemsByOrder.has(key)) itemsByOrder.set(key, []);
    itemsByOrder.get(key)!.push(item);
  }

  let total = 0;
  const rows: OrderReportRow[] = orders.map((order) => {
    const orderItems = itemsByOrder.get(order._id.toString()) || [];
    const grandTotal = order.status === "cancelled" ? 0 : totalsForOrder(order, orderItems, taxRates).grandTotal;
    total += grandTotal;
    return { order: order as unknown as ReportOrder, grandTotal };
  });
  return { rows, total: Math.round(total * 100) / 100, count: rows.length };
}

export async function buildOrdersCsv(ctx: RequestContext, query: OrderFilterInput): Promise<string> {
  const { rows, total, count } = await buildOrderReport(ctx, query);
  const header = [
    "Invoice No",
    "Customer",
    "Phone",
    "Type",
    "Check-in",
    "Members",
    "Status",
    "Payment",
    "Coupon",
    "Total",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const { order, grandTotal } of rows) {
    lines.push(
      [
        order.invoiceNumber || "",
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
  lines.push(["", "", "", "", "", "", "", "", csvCell(`Total (${count})`), csvCell(total.toFixed(2))].join(","));
  return "﻿" + lines.join("\r\n");
}

export async function buildOrdersPdfData(ctx: RequestContext, query: OrderFilterInput) {
  const restaurant = await new OrdersRepository(ctx.restaurantId).findRestaurant();
  if (!restaurant) throw new HttpError(404, "Restaurant not found");
  const { rows, total, count } = await buildOrderReport(ctx, query);
  const rangeLabel =
    query.today === "true"
      ? "Today"
      : query.from || query.to
        ? [query.from, query.to].filter(Boolean).join(" to ")
        : "All dates";

  return {
    restaurant,
    filename: reportFilename(query, "pdf"),
    title: `Orders report - ${query.type ? orderTypeLabel({ orderType: query.type }) : "All types"}`,
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
  };
}

export type InvoiceStatus = "reopened" | "unpaid" | "paid" | "cancelled" | "voided";

function invoiceStatus(order: Pick<IOrder, "status" | "voidedAt">): InvoiceStatus {
  if (order.voidedAt) return "voided";
  if (order.status === "cancelled") return "cancelled";
  if (order.status === "closed") return "paid";
  if (order.status === "open") return "reopened";
  return "unpaid";
}

export async function listInvoices(ctx: RequestContext, query: InvoiceRegisterInput) {
  const repo = new OrdersRepository(ctx.restaurantId);
  const restaurant = await repo.findRestaurant("dayEndTime timezone");
  const range: Record<string, Date> = {};
  if (query.from)
    range.$gte = getBusinessDayRangeForDate(query.from, restaurant?.dayEndTime, restaurant?.timezone).start;
  if (query.to) range.$lt = getBusinessDayRangeForDate(query.to, restaurant?.dayEndTime, restaurant?.timezone).end;

  const orders = await repo.findInvoices(Object.keys(range).length ? { billedAt: range } : {});
  return orders.map((order) => ({
    orderId: order._id,
    invoiceNumber: order.invoiceNumber!,
    billedAt: order.billedAt ?? null,
    customerName: order.customerName,
    customerGstin: order.customerGstin ?? "",
    orderType: order.orderType,
    status: invoiceStatus(order),
    paymentMethod: order.paymentMethod,
    grandTotal: order.bill?.grandTotal ?? null,
    reason: order.voidReason || order.cancelReason || "",
  }));
}
