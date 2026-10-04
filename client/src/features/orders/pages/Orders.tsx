import { Archive, ChevronRight, ClipboardList, Download } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useAdmin } from "../../../lib/adminAuth";
import type { OrderStatus, OrderType } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { csvToSheet } from "../../../shared/export/excel";
import { confirmDialog } from "../../../shared/ui/confirm";
import { ExcelButton } from "../../../shared/ui/ExcelButton";
import { usePageTour, type TourStep } from "../../../shared/ui/PageTour";
import { buttonClass } from "../../../shared/ui/styles";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorText,
  Field,
  Input,
  Page,
  PageHeader,
  Select,
  TableWrap,
  Tabs,
} from "../../../shared/ui/ui";
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
      !(await confirmDialog({
        title: "Archive these orders?",
        message:
          "Paid and cancelled orders shown here leave this list but stay in reports and the invoice register. Test orders that never reached the kitchen are deleted. Unpaid bills and orders in the kitchen are left alone.",
        confirmLabel: "Archive",
        tone: "primary",
      }))
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

  const title =
    type === "dine-in"
      ? "Dine-in orders"
      : type === "takeaway"
        ? "Take-away orders"
        : type === "delivery"
          ? "Delivery orders"
          : "All orders";
  const yesterday = dayFromToday(-1);
  const tomorrow = dayFromToday(1);
  const quick = today
    ? "today"
    : from && from === to
      ? from === yesterday
        ? "yesterday"
        : from === tomorrow
          ? "tomorrow"
          : ""
      : "";

  const tourSteps: TourStep[] = useMemo(
    () => [
      {
        target: "orders-type-tabs",
        title: "Filter by order type",
        description: "Switch between all orders, dine-in, take-away and delivery.",
      },
      {
        target: "orders-status",
        title: "Filter by status",
        description: "Narrow the list to open, billed (unpaid), paid or cancelled orders.",
      },
      {
        target: "orders-date-range",
        title: "Pick a date range",
        description:
          "Set a custom From/To range. Dates follow your business day, so an order placed after midnight but before your day-end time still counts as the earlier day.",
      },
      {
        target: "orders-quick-days",
        title: "Jump to a day",
        description: "Quick shortcuts for yesterday, today or tomorrow instead of picking dates by hand.",
      },
      {
        target: "orders-csv",
        title: "Download as CSV",
        description: "Export the orders matching your current filters as a spreadsheet.",
      },
      {
        target: "orders-pdf",
        title: "Download as PDF",
        description: "Export the same filtered list as a formatted PDF report.",
      },
      ...(profile?.isOwner
        ? [
            {
              target: "orders-archive",
              title: "Archive old orders",
              description:
                "Owner-only. Hides paid and cancelled orders matching your filters from this list (they stay in reports and the invoice register) and deletes test orders that never reached the kitchen.",
            },
          ]
        : []),
      {
        target: "orders-results",
        title: "Results",
        description: "Your filtered orders appear here. Tap or click a row to open its full details.",
      },
    ],
    [profile?.isOwner]
  );
  usePageTour(tourSteps);

  return (
    <Page>
      <PageHeader
        title={title}
        description="Business-day filters follow your day-end time, so late-night orders stay on the right day."
        actions={
          <>
            <Button
              data-tour="orders-csv"
              variant="secondary"
              icon={Download}
              loading={downloading === "csv"}
              onClick={() => downloadReport("csv")}
              disabled={downloading !== null}
            >
              CSV
            </Button>
            <ExcelButton
              fileName="orders"
              disabled={downloading !== null}
              sheets={async () => {
                const res = await ordersApi.report("csv", currentParams());
                return [csvToSheet("Orders", await (res.data as Blob).text())];
              }}
            />
            <Button
              data-tour="orders-pdf"
              variant="secondary"
              icon={Download}
              loading={downloading === "pdf"}
              onClick={() => downloadReport("pdf")}
              disabled={downloading !== null}
            >
              PDF
            </Button>
            {profile?.isOwner && (
              <Button
                data-tour="orders-archive"
                variant="secondary"
                icon={Archive}
                className="!text-red-600 hover:!bg-red-50"
                onClick={clearAll}
                loading={clearing}
                disabled={orders.length === 0}
              >
                Archive
              </Button>
            )}
          </>
        }
      />

      <Card>
        <div className="flex flex-col gap-4">
          <div data-tour="orders-type-tabs">
            <Tabs
              value={type || "all"}
              onChange={(v) => updateParam("type", v === "all" ? "" : v)}
              items={[
                { value: "all", label: "All" },
                { value: "dine-in", label: "Dine-in" },
                { value: "takeaway", label: "Take away" },
                { value: "delivery", label: "Delivery" },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-[minmax(12rem,1fr)_auto_auto_auto] md:items-end">
            <Field label="Status" htmlFor="orders-status" className="col-span-2 md:col-span-1">
              <Select
                id="orders-status"
                data-tour="orders-status"
                value={status}
                onChange={(e) => updateParam("status", e.target.value)}
              >
                <option value="">Any status</option>
                <option value="unpaid">Unpaid (open or billed)</option>
                <option value="open">Open</option>
                <option value="billed">Billed, unpaid</option>
                <option value="closed">Paid</option>
                <option value="cancelled">Cancelled</option>
              </Select>
            </Field>
            <Field label="From" htmlFor="orders-from">
              <Input
                id="orders-from"
                data-tour="orders-date-range"
                type="date"
                value={today ? "" : from}
                onChange={(e) => updateParam("from", e.target.value)}
              />
            </Field>
            <Field label="To" htmlFor="orders-to">
              <Input
                id="orders-to"
                type="date"
                value={today ? "" : to}
                onChange={(e) => updateParam("to", e.target.value)}
              />
            </Field>
            <div className="col-span-2 md:col-span-1" data-tour="orders-quick-days">
              <Tabs
                value={quick || "none"}
                onChange={(v) => (v === "today" ? selectToday() : selectDayFromToday(v === "yesterday" ? -1 : 1))}
                items={[
                  { value: "yesterday", label: "Yesterday" },
                  { value: "today", label: "Today" },
                  { value: "tomorrow", label: "Tomorrow" },
                ]}
              />
            </div>
          </div>
        </div>
      </Card>

      <ErrorText>{error}</ErrorText>
      {archiveNote && (
        <Alert tone="success" onClose={() => setArchiveNote(null)}>
          {archiveNote}
        </Alert>
      )}

      <Card data-tour="orders-results">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Results</h2>
          <Badge tone="gray">{orders.length} orders</Badge>
        </div>
        {orders.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No orders found" description="Try another type, status or date." />
        ) : (
          <>
            <ul className="-mx-4 divide-y divide-slate-100 border-t border-slate-100 md:hidden">
              {orders.map((order) => {
                const badge = orderStatusBadge(order);
                return (
                  <li key={order._id}>
                    <Link
                      to={`/admin/orders/${order._id}`}
                      className="flex items-center gap-3 px-4 py-3 active:bg-slate-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-slate-900">{order.customerName || "Guest"}</span>
                          <Badge tone={badge.tone}>{badge.label}</Badge>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {orderTypeLabel(order)} ·{" "}
                          {new Date(order.checkinTime).toLocaleString([], {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </p>
                        {order.invoiceNumber && (
                          <p className="font-mono text-xs text-slate-400">{order.invoiceNumber}</p>
                        )}
                      </div>
                      <ChevronRight size={18} className="shrink-0 text-slate-300" aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="hidden md:block">
              <TableWrap>
                <table className="min-w-[44rem]">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Customer</th>
                      <th>Type</th>
                      <th>Check-in</th>
                      <th>Status</th>
                      <th>Payment</th>
                      <th className="text-right">
                        <span className="sr-only">Open</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order._id}>
                        <td className="font-mono text-xs text-slate-600">{order.invoiceNumber ?? "—"}</td>
                        <td className="font-medium text-slate-900">{order.customerName}</td>
                        <td className="text-slate-600">{orderTypeLabel(order)}</td>
                        <td className="whitespace-nowrap text-slate-600 tabular-nums">
                          {new Date(order.checkinTime).toLocaleString([], {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </td>
                        <td>
                          <Badge tone={orderStatusBadge(order).tone} dot>
                            {orderStatusBadge(order).label}
                          </Badge>
                        </td>
                        <td className="text-slate-600 capitalize">{order.paymentMethod}</td>
                        <td className="text-right">
                          <Link className={buttonClass("ghost", "sm")} to={`/admin/orders/${order._id}`}>
                            View
                            <ChevronRight size={14} aria-hidden="true" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </div>
          </>
        )}
      </Card>
    </Page>
  );
}

function dayFromToday(offsetDays: number): string {
  const base = new Date();
  base.setDate(base.getDate() + offsetDays);
  return base.toLocaleDateString("en-CA");
}
