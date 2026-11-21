import { CheckCircle2, Clock, HandPlatter, Printer, Send, ShoppingBag } from "lucide-react";
import { useMemo, useState } from "react";

import type { PosOrderSummary, PosTable, PosToday, PosTodayLine, PosTodayOrder } from "../../../lib/types";
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
  cafe,
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
  cafe: boolean;
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
              {cafe ? "awaiting payment" : `${unsent} ${payFirst ? "waiting for payment" : "not sent"}`}
            </span>
          )}
        </span>
      )}
    </button>
  );
}

type TodayFilter = "all" | "open" | "unpaid" | "paid" | "notPrinted" | "cancelled";

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const ORDER_BADGE: Record<string, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-amber-100 text-amber-900" },
  billed: { label: "Bill printed, not paid", className: "bg-blue-100 text-blue-800" },
  closed: { label: "Paid", className: "bg-green-100 text-green-800" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-800" },
};

const TABLE_STATE: Record<string, { label: string; className: string }> = {
  occupied: { label: "occupied", className: "bg-amber-50 text-amber-900 ring-amber-200" },
  awaiting_payment: { label: "waiting to pay", className: "bg-blue-50 text-blue-800 ring-blue-200" },
  available: { label: "free", className: "bg-slate-50 text-slate-600 ring-slate-200" },
};

function Chip({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 ${className}`}>{children}</span>;
}

/** Where a dish is: not sent to the kitchen yet, waiting, being cooked, ready to serve, served or cancelled. */
function dishState(line: PosTodayLine): { label: string; className: string } {
  if (line.status === "cancelled") return { label: "Cancelled", className: "text-red-600" };
  if (line.status === "served") return { label: "Served", className: "text-slate-500" };
  if (line.status === "ready") return { label: "Ready to serve", className: "text-green-700" };
  if (line.status === "preparing") return { label: "Cooking", className: "text-orange-700" };
  return line.sent ? { label: "Waiting", className: "text-amber-700" } : { label: "Not sent", className: "text-slate-700" };
}

const TAG = "rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200";

/** The dishes of an order with what was chosen for each: options, Jain, pack, spice and the guest's comment. */
function DishLines({ lines }: { lines: PosTodayLine[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? lines : lines.slice(0, 3);
  if (lines.length === 0) return null;
  return (
    <div className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1" data-testid="today-dishes">
      <ul className="divide-y divide-slate-100">
        {shown.map((line, index) => {
          const state = dishState(line);
          const tags = [
            line.jain && "Jain",
            line.pack && "Pack",
            line.free && "Complimentary",
            ...line.options,
            line.combo.length > 0 && `Combo: ${line.combo.join(", ")}`,
          ].filter(Boolean) as string[];
          return (
            <li key={index} className="py-1.5 text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <span className={`min-w-0 font-semibold text-slate-800 ${line.status === "cancelled" ? "line-through opacity-60" : ""}`}>
                  {line.quantity}× {line.name}
                </span>
                <span className={`shrink-0 text-[10px] font-bold uppercase ${state.className}`}>
                  {line.token != null ? `T${line.token} · ` : ""}
                  {state.label}
                </span>
              </div>
              {tags.length > 0 && (
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {tags.map((tag) => (
                    <span key={tag} className={TAG}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              {line.note && <p className="mt-0.5 text-[11px] text-slate-500 italic">“{line.note}”</p>}
            </li>
          );
        })}
      </ul>
      {lines.length > 3 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setAll((v) => !v);
          }}
          className="py-1 text-[11px] font-semibold text-orange-700 hover:underline"
        >
          {all ? "Show fewer" : `Show all ${lines.length} dishes`}
        </button>
      )}
    </div>
  );
}

/** Every order of the day: its status, its table's state and how far its dishes got, with print and share buttons. */
function TodayOrders({
  today,
  selectedId,
  onSelect,
}: {
  today: PosToday;
  selectedId: string | null;
  onSelect: (order: PosTodayOrder) => void;
}) {
  const [filter, setFilter] = useState<TodayFilter>("all");
  const hasInvoice = (o: PosTodayOrder) => !!o.invoiceNumber && (o.status === "billed" || o.status === "closed");
  const count = (test: (o: PosTodayOrder) => boolean) => today.orders.filter(test).length;
  const shown = today.orders.filter(
    (o) =>
      filter === "all" ||
      (filter === "open"
        ? o.status === "open"
        : filter === "unpaid"
          ? o.status === "billed"
          : filter === "paid"
            ? o.status === "closed"
            : filter === "cancelled"
              ? o.status === "cancelled"
              : hasInvoice(o) && !o.invoicePrintedAt)
  );
  const total = shown.filter((o) => o.status !== "cancelled").reduce((sum, o) => sum + o.total, 0);
  return (
    <section className="flex flex-col gap-2" data-testid="today-orders">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
        <Printer size={13} aria-hidden="true" />
        Today's orders and invoices
      </h3>
      <p className="-mt-1 text-xs text-slate-500">Tap an order to open it and bill, settle or reprint it.</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            ["all", `All ${today.orders.length}`],
            ["open", `Open ${count((o) => o.status === "open")}`],
            ["unpaid", `Bill, not paid ${count((o) => o.status === "billed")}`],
            ["paid", `Paid ${count((o) => o.status === "closed")}`],
            ["notPrinted", `Invoice not printed ${today.notPrinted}`],
            ["cancelled", `Cancelled ${count((o) => o.status === "cancelled")}`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              filter === value ? "border-orange-600 bg-orange-600 text-white" : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-500 tabular-nums">
          {shown.length} shown · {rupees(total)}
        </span>
      </div>
      {shown.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">
          {today.orders.length === 0 ? "No orders yet today." : "Nothing in this view."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((o) => {
            const status = ORDER_BADGE[o.status] ?? ORDER_BADGE.open;
            const table = o.tableStatus ? TABLE_STATE[o.tableStatus] : null;
            const it = o.items;
            const place = o.tableCode ? `Table ${o.tableCode}` : o.orderType === "takeaway" ? "Takeaway" : "Counter";
            const pickable = o.status !== "cancelled";
            const selected = selectedId === o._id;
            return (
              <li
                key={o._id}
                {...(pickable && {
                  role: "button",
                  tabIndex: 0,
                  "aria-pressed": selected,
                  "aria-label": `Open ${o.invoiceNumber ?? "order"} ${o.customerName}`,
                  onClick: () => onSelect(o),
                  onKeyDown: (e: React.KeyboardEvent) => {
                    if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      onSelect(o);
                    }
                  },
                })}
                className={`rounded-xl border-2 p-3 shadow-sm transition ${
                  selected
                    ? "border-orange-500 bg-orange-50 ring-2 ring-orange-200"
                    : "border-slate-200 bg-white"
                } ${pickable ? "cursor-pointer hover:border-orange-300" : "opacity-80"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-slate-900">
                      <span className="truncate">{o.invoiceNumber ?? "Not billed yet"}</span>
                      {o.tokens.map((token) => (
                        <span key={token} className="rounded bg-slate-900 px-1.5 py-0.5 text-[11px] font-bold text-white">
                          Token T{token}
                        </span>
                      ))}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {[place, o.customerName].filter(Boolean).join(" · ")} · {timeOf(o.at)}
                    </p>
                  </div>
                  <p className="shrink-0 text-lg font-bold text-slate-900 tabular-nums">{rupees(o.total)}</p>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                  <Chip className={status.className}>
                    {status.label}
                    {o.status === "closed" && o.paymentMethod && o.paymentMethod !== "pending" ? ` · ${o.paymentMethod}` : ""}
                  </Chip>
                  {table && (
                    <span className={`rounded-full px-2 py-0.5 ring-1 ring-inset ${table.className}`}>
                      Table {o.tableCode} {table.label}
                    </span>
                  )}
                  {hasInvoice(o) &&
                    (o.invoicePrintedAt ? (
                      <Chip className="bg-slate-100 text-slate-600">
                        <CheckCircle2 size={11} aria-hidden="true" className="mr-1 inline" />
                        Invoice printed{o.invoicePrintCount > 1 ? ` ×${o.invoicePrintCount}` : ""}
                      </Chip>
                    ) : (
                      <Chip className="bg-amber-100 text-amber-900">Invoice not printed</Chip>
                    ))}
                </div>

                {(it.total > 0 || it.cancelled > 0) && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold" aria-label="Dish status">
                    <span className="text-slate-500">{it.total} dish{it.total === 1 ? "" : "es"}{it.cancelled > 0 || it.total > 0 ? ":" : ""}</span>
                    {it.unsent > 0 && <Chip className="bg-slate-700 text-white">{it.unsent} not sent</Chip>}
                    {it.waiting > 0 && <Chip className="bg-amber-100 text-amber-900">{it.waiting} waiting</Chip>}
                    {it.preparing > 0 && <Chip className="bg-orange-100 text-orange-800">{it.preparing} cooking</Chip>}
                    {it.ready > 0 && <Chip className="bg-green-600 text-white">{it.ready} ready to serve</Chip>}
                    {it.served > 0 && <Chip className="bg-slate-100 text-slate-600">{it.served} served</Chip>}
                    {it.cancelled > 0 && <Chip className="bg-red-100 text-red-700">{it.cancelled} cancelled</Chip>}
                  </div>
                )}

                <DishLines lines={o.lines} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
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
  onAddDishes,
  onCancelEmpty,
  today,
  selectedOrderId = null,
  onSelectToday,
  payFirst = false,
  cafe = false,
}: {
  tables: PosTable[];
  takeaways: PosOrderSummary[];
  tableId: string | null;
  orderId: string | null;
  onSelectTable: (table: PosTable) => void;
  onSelectTakeaway: (order: PosOrderSummary) => void;
  /** An order with no dishes left: go and add some. */
  onAddDishes?: (order: PosOrderSummary) => void;
  /** An order with no dishes left: cancel it instead of leaving it on the board. */
  onCancelEmpty?: (order: PosOrderSummary) => void;
  /** Today's billed and paid orders, with whether each invoice was printed. */
  today?: PosToday;
  /** The order open in the panel, highlighted in the day's list. */
  selectedOrderId?: string | null;
  /** An order picked from the day's list to bill, settle or reprint. */
  onSelectToday?: (order: PosTodayOrder) => void;
  /** Dine-in guests pay when ordering, so a running table order is one waiting to be paid. */
  payFirst?: boolean;
  /** Cafe flow: orders are paid before they are cooked, so there is no "bill printed" state. */
  cafe?: boolean;
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
  const billCount = cafe ? active.length : active.filter((t) => t.status === "awaiting_payment").length;
  const showTakeaways = filter === "all" || filter === "running";

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <div className="grid grid-cols-3 gap-2 text-center text-xs font-medium">
        <span className="rounded-lg border border-slate-200 bg-white py-1.5 text-slate-700">
          <b className="block text-base tabular-nums">{active.length}</b>Active tables
        </span>
        <span className="rounded-lg border border-blue-300 bg-blue-50 py-1.5 text-blue-900">
          <b className="block text-base tabular-nums">{billCount}</b>
          {cafe ? "To pay" : "Waiting to pay"}
        </span>
        <span className="rounded-lg border border-orange-300 bg-orange-50 py-1.5 text-orange-900">
          <b className="block text-base tabular-nums">{rupees(outstanding)}</b>To collect
        </span>
      </div>

      <div className={`flex gap-1.5 ${cafe ? "hidden" : ""}`}>
        {(
          [
            ["all", "All"],
            ["running", "Running"],
            ["bill", "Waiting to pay"],
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
              status={
                cafe
                  ? "Awaiting payment"
                  : table.status === "awaiting_payment"
                    ? "Waiting to pay"
                    : payFirst
                      ? "To pay"
                      : "Running"
              }
              billPrinted={cafe ? false : table.status === "awaiting_payment"}
              cafe={cafe}
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
            Takeaway and bills to pay at the counter
          </h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
            {takeaways.map((order) => (
              <div key={order._id} className="flex flex-col gap-1.5">
              <Card
                selected={!tableId && orderId === order._id}
                onClick={() => onSelectTakeaway(order)}
                title={
                  order.payAtCounter && order.tableCode
                    ? `Table ${order.tableCode} · ${order.customerName || "Guest"}`
                    : order.customerName || "Takeaway"
                }
                subtitle={
                  order.invoiceNumber ??
                  (order.payAtCounter
                    ? "Left the table, pays at the counter"
                    : order.source === "kiosk"
                      ? `Kiosk · ${order.orderType === "takeaway" ? "take away" : "eat here"}`
                      : "Takeaway order")
                }
                status={
                  order.payAtCounter
                    ? "Pay at counter"
                    : cafe
                    ? "Awaiting payment"
                    : order.status === "billed"
                      ? "Bill printed"
                      : order.source === "kiosk"
                        ? "To pay"
                        : "Running"
                }
                billPrinted={cafe ? false : order.status === "billed"}
                cafe={cafe}
                orders={[order]}
                minutes={minutesSince(order.createdAt, now)}
                payFirst={order.source === "kiosk"}
              />
              {order.itemCount === 0 && order.status === "open" && (onAddDishes || onCancelEmpty) && (
                <div className="flex gap-2" data-testid="empty-order-actions">
                  <span className="sr-only">This order has no dishes</span>
                  {onAddDishes && (
                    <button
                      type="button"
                      onClick={() => onAddDishes(order)}
                      className="min-h-[40px] flex-1 rounded-lg border border-orange-300 bg-white px-2 text-xs font-semibold text-orange-700 hover:bg-orange-50"
                    >
                      Add dishes
                    </button>
                  )}
                  {onCancelEmpty && (
                    <button
                      type="button"
                      onClick={() => onCancelEmpty(order)}
                      className="min-h-[40px] flex-1 rounded-lg border border-red-200 bg-white px-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                    >
                      Cancel order
                    </button>
                  )}
                </div>
              )}
              </div>
            ))}
          </div>
        </section>
      )}

      {today && onSelectToday && <TodayOrders today={today} selectedId={selectedOrderId} onSelect={onSelectToday} />}
    </div>
  );
}
