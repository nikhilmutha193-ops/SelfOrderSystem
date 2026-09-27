import {
  Armchair,
  ChevronDown,
  CircleCheck,
  ClipboardList,
  CookingPot,
  IndianRupee,
  MessagesSquare,
  MonitorSmartphone,
  PackageOpen,
  Plus,
  ShoppingBag,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { can, useAdmin } from "../../../lib/adminAuth";
import type { Order } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { buttonClass } from "../../../shared/ui/styles";
import {
  Badge,
  Card,
  EmptyState,
  ErrorText,
  Page,
  PageHeader,
  Skeleton,
  StatCard,
  type BadgeTone,
} from "../../../shared/ui/ui";
import { useOrders } from "../../orders/queries";
import { useDashboardSummary } from "../queries";

function orderTypeLabel(o: Order): string {
  if (o.orderType === "dine-in") {
    return typeof o.tableId === "object" && o.tableId?.code ? `Table ${o.tableId.code}` : "Counter";
  }
  if (o.orderType === "takeaway") return "Take away";
  return `Delivery${o.deliveryProvider ? ` (${o.deliveryProvider})` : ""}`;
}

function kitchenBadge(o: Order): { label: string; tone: BadgeTone } {
  const k = o.kitchen;
  if (!k || k.active === 0) return { label: "No items", tone: "gray" };
  if (k.served === k.active) return { label: "All served", tone: "green" };
  if (k.preparing > 0) return { label: "Preparing", tone: "blue" };
  if (k.ready > 0) return { label: "Ready to serve", tone: "green" };
  if (k.pendingSent > 0) return { label: "In kitchen", tone: "amber" };
  if (k.pendingUnsent > 0) return { label: "Not sent to kitchen", tone: "gray" };
  return { label: "In progress", tone: "amber" };
}

const ORDER_GROUPS: { key: string; label: string; icon: LucideIcon; match: (t: Order["orderType"]) => boolean }[] = [
  { key: "dine-in", label: "Dine-in", icon: Armchair, match: (t) => t === "dine-in" },
  { key: "takeaway", label: "Take away", icon: ShoppingBag, match: (t) => t === "takeaway" },
  { key: "other", label: "Other", icon: Truck, match: (t) => t !== "dine-in" && t !== "takeaway" },
];

interface AttentionItem {
  to: string;
  icon: LucideIcon;
  label: string;
  tone: string;
}

function Attention({ to, icon: Icon, label, tone }: AttentionItem) {
  return (
    <Link
      to={to}
      className={`flex min-h-[44px] items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${tone}`}
    >
      <Icon size={18} aria-hidden="true" />
      <span className="min-w-0 flex-1">{label}</span>
      <span aria-hidden="true">→</span>
    </Link>
  );
}

export default function Dashboard() {
  const { profile } = useAdmin();
  const summaryQuery = useDashboardSummary();
  const todayQuery = useOrders({ today: "true", status: "open" });
  const summary = summaryQuery.data ?? null;
  const todayOrders = todayQuery.data ?? [];
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const loadError = summaryQuery.error ?? todayQuery.error;
  const error = loadError ? extractErrorMessage(loadError) : null;
  const canOrders = can(profile, "orders", "edit");

  const dayStart = summary
    ? new Date(summary.businessDayStart).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })
    : null;

  const attention: AttentionItem[] = [];
  if (summary) {
    const awaiting = summary.tablesAwaitingPayment ?? 0;
    const lowStock = summary.lowStockItems ?? 0;
    if (awaiting > 0) {
      attention.push({
        to: "/admin/orders?type=dine-in",
        icon: Wallet,
        label: `${awaiting} table${awaiting === 1 ? "" : "s"} waiting to pay`,
        tone: "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100",
      });
    }
    if (summary.unreadChatCount > 0) {
      attention.push({
        to: "/admin/messages",
        icon: MessagesSquare,
        label: `${summary.unreadChatCount} unread guest message${summary.unreadChatCount === 1 ? "" : "s"}`,
        tone: "border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100",
      });
    }
    if (lowStock > 0) {
      attention.push({
        to: "/admin/inventory",
        icon: PackageOpen,
        label: `${lowStock} ingredient${lowStock === 1 ? "" : "s"} running low`,
        tone: "border-red-200 bg-red-50 text-red-900 hover:bg-red-100",
      });
    }
  }

  return (
    <Page>
      <PageHeader
        title="Dashboard"
        description={dayStart ? `Today started ${dayStart}, based on your day-end time.` : "Today at a glance."}
        actions={
          canOrders && (
            <>
              <Link to="/pos" className={buttonClass("secondary")}>
                <MonitorSmartphone size={16} aria-hidden="true" />
                Open POS
              </Link>
              <Link to="/admin/delivery/new" className={buttonClass("primary")}>
                <Plus size={16} aria-hidden="true" />
                New order
              </Link>
            </>
          )
        }
      />
      <ErrorText>{error}</ErrorText>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {summary ? (
          <>
            <StatCard label="Sales today" value={`₹${summary.salesToday.toFixed(2)}`} icon={IndianRupee} tone="green" />
            <StatCard label="Open orders" value={summary.openOrdersToday} icon={ClipboardList} tone="orange" />
            <StatCard label="Paid orders" value={summary.closedOrdersToday} icon={CircleCheck} tone="blue" />
            <StatCard label="Items in kitchen" value={summary.pendingKotItems} icon={CookingPot} tone="amber" />
          </>
        ) : (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[104px] rounded-xl" />)
        )}
      </div>

      {attention.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {attention.map((a) => (
            <Attention key={a.to} {...a} />
          ))}
        </div>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Open orders</h2>
          {todayOrders.length > 0 && <Badge tone="orange">{todayOrders.length} open</Badge>}
        </div>
        {todayQuery.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : todayOrders.length === 0 ? (
          <Card>
            <EmptyState
              icon={ClipboardList}
              title="No open orders"
              description="New orders from tables, the POS and the captain app appear here."
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            {ORDER_GROUPS.map((group) => {
              const groupOrders = todayOrders.filter((o) => group.match(o.orderType));
              if (groupOrders.length === 0) return null;
              const isCollapsed = collapsed[group.key];
              const Icon = group.icon;
              return (
                <Card key={group.key} padding="none" className="overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setCollapsed((c) => ({ ...c, [group.key]: !c[group.key] }))}
                    aria-expanded={!isCollapsed}
                    className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50 sm:px-5"
                  >
                    <span className="flex items-center gap-3 font-semibold text-slate-900">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                        <Icon size={16} aria-hidden="true" />
                      </span>
                      {group.label}
                      <Badge tone="gray">{groupOrders.length}</Badge>
                    </span>
                    <ChevronDown
                      size={18}
                      className={`text-slate-400 transition-transform ${isCollapsed ? "" : "rotate-180"}`}
                      aria-hidden="true"
                    />
                  </button>
                  {!isCollapsed && (
                    <div className="grid grid-cols-1 gap-3 border-t border-slate-100 bg-slate-50/50 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-3 2xl:grid-cols-4">
                      {groupOrders.map((order) => (
                        <OrderBox key={order._id} order={order} />
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </Page>
  );
}

function OrderBox({ order }: { order: Order }) {
  const kb = kitchenBadge(order);
  return (
    <Link
      to={`/admin/orders/${order._id}`}
      className="group flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-raised"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900">{order.customerName || "Guest"}</p>
          <p className="text-sm text-slate-500">{orderTypeLabel(order)}</p>
        </div>
        <span className="shrink-0 text-xs font-medium text-slate-400 tabular-nums">
          {new Date(order.checkinTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Badge tone={kb.tone} dot>
          {kb.label}
        </Badge>
        <span className="text-xs font-semibold text-orange-700 opacity-0 transition-opacity group-hover:opacity-100">
          Open →
        </span>
      </div>
    </Link>
  );
}
