import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useAdmin } from "../../../lib/adminAuth";
import type { OrderStatus, OrderType } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { Badge, Button, Card, ErrorText, Input, Select, TableWrap } from "../../../shared/ui/ui";
import { ordersApi, type OrderFilters, type ReportFormat } from "../api";
import { useArchiveOrders, useOrders } from "../queries";
import { orderStatusBadge, orderTypeLabel } from "../status";

export default function Orders() {
  const [searchParams, setSearchParams] = useSearchParams();
  const type = (searchParams.get("type") as OrderType) || "";
  const status = (searchParams.get("status") as OrderStatus) || "";
  const today = searchParams.get("today") === "true";
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";

  const { profile } = useAdmin();
  const [actionError, setActionError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<ReportFormat | null>(null);
  const ordersQuery = useOrders(currentParams());
  const archiveOrders = useArchiveOrders();
  const [archiveNote, setArchiveNote] = useState<string | null>(null);
  const orders = ordersQuery.data ?? [];
  const clearing = archiveOrders.isPending;
  const error = actionError ?? (ordersQuery.error ? extractErrorMessage(ordersQuery.error) : null);

  // Mirrors the active filters into the report request so the download matches the table.
  function currentParams(): OrderFilters {
    const params: OrderFilters = {};
    if (type) params.type = type;
    if (status) params.status = status;
    if (today) params.today = "true";
    else {
      if (from) params.from = from;
      if (to) params.to = to;
    }
    return params;
  }

  async function downloadReport(format: ReportFormat) {
    setActionError(null);
    setDownloading(format);
    try {
      const res = await ordersApi.report(format, currentParams());
      const disposition = res.headers["content-disposition"] as string | undefined;
      const match = disposition?.match(/filename="([^"]+)"/);
      const url = URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = match?.[1] || `orders-report.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      setActionError(extractErrorMessage(err));
    } finally {
      setDownloading(null);
    }
  }

  async function clearAll() {
    if (orders.length === 0) return;
    if (
      !window.confirm(
        "Archive the paid and cancelled orders shown here? They disappear from this list but stay in reports and the invoice register. " +
          "Test orders that never reached the kitchen are deleted. Unpaid bills and orders in the kitchen are left alone."
      )
    )
      return;
    setActionError(null);
    setArchiveNote(null);
    try {
      const result = await archiveOrders.mutateAsync(currentParams());
      setArchiveNote(`Archived ${result.archived} order(s) and deleted ${result.deleted} unsent test order(s).`);
    } catch (err) {
      setActionError(extractErrorMessage(err));
    }
  }

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === "from" || key === "to") {
      next.delete("today");
      const other = key === "from" ? "to" : "from";
      if (value && !next.get(other)) next.set(other, value);
    }
    setSearchParams(next);
  }

  function selectToday() {
    const next = new URLSearchParams(searchParams);
    next.set("today", "true");
    next.delete("from");
    next.delete("to");
    setSearchParams(next);
  }

  function selectDayFromToday(offsetDays: number) {
    const base = new Date();
    base.setDate(base.getDate() + offsetDays);
    const value = base.toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
    const next = new URLSearchParams(searchParams);
    next.delete("today");
    next.set("from", value);
    next.set("to", value);
    setSearchParams(next);
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-800">Orders</h1>

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-slate-700">
            Type
            <Select className="mt-1" value={type} onChange={(e) => updateParam("type", e.target.value)}>
              <option value="">All</option>
              <option value="dine-in">Dine-in</option>
              <option value="takeaway">Take away</option>
              <option value="delivery">Delivery (old)</option>
            </Select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Status
            <Select className="mt-1" value={status} onChange={(e) => updateParam("status", e.target.value)}>
              <option value="">All</option>
              <option value="unpaid">Unpaid (open or billed)</option>
              <option value="open">Open</option>
              <option value="billed">Billed, unpaid</option>
              <option value="closed">Closed</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            From
            <Input
              className="mt-1"
              type="date"
              value={today ? "" : from}
              onChange={(e) => updateParam("from", e.target.value)}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            To
            <Input
              className="mt-1"
              type="date"
              value={today ? "" : to}
              onChange={(e) => updateParam("to", e.target.value)}
            />
          </label>
          <Button type="button" variant="secondary" onClick={() => selectDayFromToday(-1)}>
            Yesterday
          </Button>
          <Button type="button" variant={today ? "primary" : "secondary"} onClick={selectToday}>
            Today
          </Button>
          <Button type="button" variant="secondary" onClick={() => selectDayFromToday(1)}>
            Tomorrow
          </Button>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button type="button" onClick={() => downloadReport("csv")} disabled={downloading !== null}>
              {downloading === "csv" ? "Preparing..." : "Download CSV"}
            </Button>
            <Button type="button" onClick={() => downloadReport("pdf")} disabled={downloading !== null}>
              {downloading === "pdf" ? "Preparing..." : "Download PDF"}
            </Button>
            {profile?.isOwner && (
              <Button type="button" variant="danger" onClick={clearAll} disabled={clearing || orders.length === 0}>
                {clearing ? "Archiving..." : "Archive"}
              </Button>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          "Today" and the From/To range use your restaurant's day-end time (Restaurant Settings), so late-night orders
          placed after midnight but before that cutoff still count toward the previous business day instead of splitting
          at midnight.
        </p>
      </Card>

      <ErrorText>{error}</ErrorText>
      {archiveNote && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{archiveNote}</p>}

      <Card>
        <TableWrap>
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-2">Invoice</th>
                <th className="pb-2">Customer</th>
                <th className="pb-2">Type</th>
                <th className="pb-2">Check-in</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Payment</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order._id} className="border-t border-slate-100">
                  <td className="py-1.5 tabular-nums text-slate-600">{order.invoiceNumber ?? "-"}</td>
                  <td className="py-1.5">{order.customerName}</td>
                  <td className="py-1.5">{orderTypeLabel(order)}</td>
                  <td className="py-1.5">{new Date(order.checkinTime).toLocaleString()}</td>
                  <td className="py-1.5">
                    <Badge tone={orderStatusBadge(order).tone}>{orderStatusBadge(order).label}</Badge>
                  </td>
                  <td className="py-1.5 capitalize">{order.paymentMethod}</td>
                  <td className="py-1.5">
                    <Link className="text-orange-600 hover:underline" to={`/admin/orders/${order._id}`}>
                      View
                    </Link>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-slate-400">
                    No orders found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </div>
  );
}
