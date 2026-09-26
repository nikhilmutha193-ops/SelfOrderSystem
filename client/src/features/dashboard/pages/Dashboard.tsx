import { useState } from "react";
import { Link } from "react-router-dom";

import type { Order } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { Badge, Card, ErrorText } from "../../../shared/ui/ui";
import { useOrders } from "../../orders/queries";
import { useDashboardSummary } from "../queries";

function orderTypeLabel(o: Order): string {
  if (o.orderType === "dine-in") {
    return typeof o.tableId === "object" && o.tableId?.code ? `Table ${o.tableId.code}` : "Counter";
  }
  if (o.orderType === "takeaway") return "Take away";
  return `Delivery${o.deliveryProvider ? ` (${o.deliveryProvider})` : ""}`;
}

function kitchenBadge(o: Order): { label: string; tone: "gray" | "amber" | "blue" | "green" } {
  const k = o.kitchen;
  if (!k || k.active === 0) return { label: "No items", tone: "gray" };
  if (k.served === k.active) return { label: "All served", tone: "green" };
  if (k.preparing > 0) return { label: "Preparing", tone: "blue" };
  if (k.ready > 0) return { label: "Ready to serve", tone: "green" };
  if (k.pendingSent > 0) return { label: "In kitchen", tone: "amber" };
  if (k.pendingUnsent > 0) return { label: "Not sent to kitchen", tone: "gray" };
  return { label: "In progress", tone: "amber" };
}

export default function Dashboard() {
  const summaryQuery = useDashboardSummary();
  const todayQuery = useOrders({ today: "true", status: "open" });
  const summary = summaryQuery.data ?? null;
  const todayOrders = todayQuery.data ?? [];
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const loadError = summaryQuery.error ?? todayQuery.error;
  const error = loadError ? extractErrorMessage(loadError) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <Link
          to="/admin/delivery/new"
          className="min-h-[44px] rounded-md bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-700"
        >
          + New order
        </Link>
      </div>
      {summary && (
        <p className="-mt-4 text-xs text-slate-400">
          "Today" is since{" "}
          {new Date(summary.businessDayStart).toLocaleString([], {
            weekday: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          (your configured day-end time)
        </p>
      )}
      <ErrorText>{error}</ErrorText>

      {summary && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Open orders today" value={summary.openOrdersToday} />
          <StatCard label="Closed orders today" value={summary.closedOrdersToday} />
          <StatCard label="Sales today" value={`₹${summary.salesToday.toFixed(2)}`} />
          <StatCard label="Pending KOT items" value={summary.pendingKotItems} />
        </div>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-800">Today's open orders</h2>
        {todayOrders.length === 0 ? (
          <Card>
            <p className="py-6 text-center text-sm text-slate-400">No open orders yet today</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            {ORDER_GROUPS.map((group) => {
              const groupOrders = todayOrders.filter((o) => group.match(o.orderType));
              if (groupOrders.length === 0) return null;
              const isCollapsed = collapsed[group.key];
              return (
                <div key={group.key} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <button
                    type="button"
                    onClick={() => setCollapsed((c) => ({ ...c, [group.key]: !c[group.key] }))}
                    className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <span className="flex items-center gap-2 font-semibold text-slate-800">
                      {group.label}
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">
                        {groupOrders.length}
                      </span>
                    </span>
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className={`text-slate-400 transition-transform ${isCollapsed ? "" : "rotate-180"}`}
                      aria-hidden="true"
                    >
                      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {!isCollapsed && (
                    <div className="grid grid-cols-1 gap-3 border-t border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {groupOrders.map((order) => (
                        <OrderBox key={order._id} order={order} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const ORDER_GROUPS: { key: string; label: string; match: (t: Order["orderType"]) => boolean }[] = [
  { key: "dine-in", label: "Dine-in", match: (t) => t === "dine-in" },
  { key: "takeaway", label: "Take away", match: (t) => t === "takeaway" },
  { key: "other", label: "Other", match: (t) => t !== "dine-in" && t !== "takeaway" },
];

function OrderBox({ order }: { order: Order }) {
  const kb = kitchenBadge(order);
  return (
    <Link
      to={`/admin/orders/${order._id}`}
      className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-base font-semibold text-slate-800">{order.customerName || "Guest"}</span>
        <Badge tone="amber">open</Badge>
      </div>
      <span className="text-sm text-slate-600">{orderTypeLabel(order)}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Kitchen</span>
        <Badge tone={kb.tone}>{kb.label}</Badge>
      </div>
      <span className="text-xs text-slate-400">
        Check-in {new Date(order.checkinTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </span>
    </Link>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-800">{value}</p>
    </Card>
  );
}
