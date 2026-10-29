import { Clock, HandPlatter, Send, ShoppingBag } from "lucide-react";
import { useMemo, useState } from "react";

import type { PosOrderSummary, PosTable } from "../../../lib/types";
import { useNow } from "../../kitchen/kds";
import { withGuestState } from "../guestTable";

type Filter = "all" | "running" | "bill";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

function minutesSince(iso: string | null, now: number) {
  return iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000)) : null;
}

function duration(minutes: number | null) {
  if (minutes === null) return "";
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes} min`;
}

function Card({
  selected,
  onClick,
  title,
  subtitle,
  status,
  billPrinted,
  orders,
  minutes,
  payFirst,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  status: string;
  billPrinted: boolean;
  orders: PosOrderSummary[];
  minutes: number | null;
  payFirst: boolean;
}) {
  const total = orders.reduce((sum, o) => sum + o.total, 0);
  const items = orders.reduce((sum, o) => sum + o.itemCount, 0);
  const ready = orders.reduce((sum, o) => sum + o.ready, 0);
  const unsent = orders.reduce((sum, o) => sum + o.unsent, 0);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex flex-col gap-2 rounded-xl border-2 p-3 text-left shadow-sm transition active:scale-[0.99] ${
        selected
          ? "border-orange-500 bg-orange-50 ring-2 ring-orange-200"
          : billPrinted
            ? "border-blue-300 bg-blue-50"
            : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block text-lg leading-tight font-bold text-slate-900">{title}</span>
          <span className="block truncate text-xs text-slate-500">{subtitle}</span>
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
            billPrinted ? "bg-blue-600 text-white" : "bg-amber-100 text-amber-900"
          }`}
        >
          {status}
        </span>
      </span>
      <span className="flex items-end justify-between gap-2">
        <span className="flex flex-col gap-1 text-xs text-slate-600">
          <span>
            {items} item{items === 1 ? "" : "s"}
            {orders.length > 1 ? ` · ${orders.length} orders` : ""}
          </span>
          {minutes !== null && (
            <span className="inline-flex items-center gap-1">
              <Clock size={12} aria-hidden="true" />
              {duration(minutes)}
            </span>
          )}
        </span>
        <span className="text-xl font-bold text-slate-900 tabular-nums">{rupees(total)}</span>
      </span>
      {(ready > 0 || unsent > 0) && (
        <span className="flex flex-wrap gap-1.5">
          {ready > 0 && (
            <span className="inline-flex items-center gap-1 rounded bg-green-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
              <HandPlatter size={11} aria-hidden="true" />
              {ready} to serve
            </span>
          )}
          {unsent > 0 && (
            <span className="inline-flex items-center gap-1 rounded bg-slate-700 px-1.5 py-0.5 text-[11px] font-semibold text-white">
              <Send size={11} aria-hidden="true" />
              {unsent} {payFirst ? "waiting for payment" : "not sent"}
            </span>
          )}
        </span>
      )}
    </button>
  );
}

/** The cashier's view: only tables (and running takeaways) that have an order to bill. */
export function CashierBoard({
  tables: rawTables,
  takeaways,
  tableId,
  orderId,
  onSelectTable,
  onSelectTakeaway,
  payFirst = false,
}: {
  tables: PosTable[];
  takeaways: PosOrderSummary[];
  tableId: string | null;
  orderId: string | null;
  onSelectTable: (table: PosTable) => void;
  onSelectTakeaway: (order: PosOrderSummary) => void;
  /** Dine-in guests pay when ordering, so a running table order is one waiting to be paid. */
  payFirst?: boolean;
}) {
  const now = useNow(30_000);
  const tables = useMemo(() => rawTables.map(withGuestState), [rawTables]);
  const [filter, setFilter] = useState<Filter>("all");

  const active = useMemo(
    () =>
      tables
        .filter((t) => t.status !== "available" && t.orders.length > 0)
        // Bills waiting for payment first, then whoever has been seated longest.
        .sort((a, b) => {
          if ((a.status === "awaiting_payment") !== (b.status === "awaiting_payment")) {
            return a.status === "awaiting_payment" ? -1 : 1;
          }
          return (a.occupiedAt ?? "").localeCompare(b.occupiedAt ?? "");
        }),
    [tables],
  );
  const shown = active.filter(
    (t) => filter === "all" || (filter === "bill" ? t.status === "awaiting_payment" : t.status !== "awaiting_payment"),
  );
  const outstanding =
    active.reduce((sum, t) => sum + t.orders.reduce((s, o) => s + o.total, 0), 0) +
    takeaways.reduce((sum, o) => sum + o.total, 0);
  const billCount = active.filter((t) => t.status === "awaiting_payment").length;
  const showTakeaways = filter === "all" || filter === "running";

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <div className="grid grid-cols-3 gap-2 text-center text-xs font-medium">
        <span className="rounded-lg border border-slate-200 bg-white py-1.5 text-slate-700">
          <b className="block text-base tabular-nums">{active.length}</b>Active tables
        </span>
        <span className="rounded-lg border border-blue-300 bg-blue-50 py-1.5 text-blue-900">
          <b className="block text-base tabular-nums">{billCount}</b>Bill printed
        </span>
        <span className="rounded-lg border border-orange-300 bg-orange-50 py-1.5 text-orange-900">
          <b className="block text-base tabular-nums">{rupees(outstanding)}</b>To collect
        </span>
      </div>

      <div className="flex gap-1.5">
        {(
          [
            ["all", "All"],
            ["running", "Running"],
            ["bill", "Bill printed"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              filter === value
                ? "border-orange-600 bg-orange-600 text-white"
                : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 && (!showTakeaways || takeaways.length === 0) && (
        <p className="py-10 text-center text-sm text-slate-500">
          {active.length === 0 ? "No table has an order to bill right now." : "No tables in this view."}
        </p>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
        {shown.map((table) => {
          const names = [...new Set(table.orders.map((o) => o.customerName).filter(Boolean))].join(", ");
          return (
            <Card
              key={table._id}
              selected={tableId === table._id}
              onClick={() => onSelectTable(table)}
              title={`Table ${table.code}`}
              subtitle={[names, table.captainName && `Captain ${table.captainName}`].filter(Boolean).join(" · ")}
              status={table.status === "awaiting_payment" ? "Bill printed" : payFirst ? "To pay" : "Running"}
              billPrinted={table.status === "awaiting_payment"}
              orders={table.orders}
              minutes={minutesSince(table.occupiedAt, now)}
              payFirst={payFirst}
            />
          );
        })}
      </div>

      {showTakeaways && takeaways.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <ShoppingBag size={13} aria-hidden="true" />
            Takeaway
          </h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
            {takeaways.map((order) => (
              <Card
                key={order._id}
                selected={!tableId && orderId === order._id}
                onClick={() => onSelectTakeaway(order)}
                title={order.customerName || "Takeaway"}
                subtitle={
                  order.invoiceNumber ??
                  (order.source === "kiosk"
                    ? `Kiosk · ${order.orderType === "takeaway" ? "take away" : "eat here"}`
                    : "Takeaway order")
                }
                status={order.status === "billed" ? "Bill printed" : order.source === "kiosk" ? "To pay" : "Running"}
                billPrinted={order.status === "billed"}
                orders={[order]}
                minutes={minutesSince(order.createdAt, now)}
                payFirst={order.source === "kiosk"}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
