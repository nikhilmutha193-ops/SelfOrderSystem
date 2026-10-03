import {
  Armchair,
  Check,
  ChevronDown,
  Clock,
  EllipsisVertical,
  Flame,
  HandPlatter,
  RotateCcw,
  Send,
  ShoppingBag,
  Truck,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { KotQueueGroup, OrderItem } from "../../../lib/types";
import { Button, IconButton } from "../../../shared/ui/ui";
import {
  formatElapsed,
  itemFilter,
  orderLabel,
  printedRounds,
  sentAt,
  ticketCounts,
  ticketUrgency,
  useNow,
  type QueueFilter,
  type Urgency,
} from "../kds";

const URGENCY: Record<Urgency, { stripe: string; pill: string; label: string; ring: string }> = {
  new: {
    stripe: "bg-[repeating-linear-gradient(90deg,var(--color-slate-300)_0_8px,transparent_8px_14px)]",
    pill: "bg-slate-100 text-slate-600",
    label: "Not sent",
    ring: "",
  },
  ontime: { stripe: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700", label: "On time", ring: "" },
  soon: { stripe: "bg-amber-400", pill: "bg-amber-50 text-amber-800", label: "Due soon", ring: "" },
  late: { stripe: "bg-red-500", pill: "bg-red-600 text-white", label: "Late", ring: "ring-2 ring-red-200" },
  ready: {
    stripe: "bg-emerald-600",
    pill: "bg-emerald-600 text-white",
    label: "Ready",
    ring: "ring-2 ring-emerald-200",
  },
};

const ITEM_STATE: Record<
  ReturnType<typeof itemFilter>,
  { border: string; text: string; label: string; row: string }
> = {
  unsent: { border: "border-l-slate-300", text: "text-slate-500", label: "Not sent", row: "" },
  waiting: { border: "border-l-amber-400", text: "text-amber-700", label: "Waiting", row: "" },
  cooking: { border: "border-l-sky-500", text: "text-sky-700", label: "Cooking", row: "bg-sky-50/40" },
  ready: { border: "border-l-emerald-500", text: "text-emerald-700", label: "Ready", row: "bg-emerald-50/70" },
};

const KIND_ICON: Record<string, LucideIcon> = { "Dine-in": Armchair, Takeaway: ShoppingBag, Delivery: Truck };

function Timer({ since, urgency }: { since: number | null; urgency: Urgency }) {
  const now = useNow(1000);
  const style = URGENCY[urgency];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${style.pill}`}
      title={style.label}
    >
      <Clock size={13} aria-hidden="true" />
      {since == null ? style.label : formatElapsed(now - since)}
    </span>
  );
}

function TicketMenu({
  rounds,
  onReprint,
}: {
  rounds: { round: number; token: number | null }[];
  onReprint: (round: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <IconButton
        icon={EllipsisVertical}
        label="Ticket options"
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      />
      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-20 mt-1 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-pop animate-pop-in"
        >
          <p className="px-2.5 pt-1 pb-1.5 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
            Reprint ticket
          </p>
          {rounds.map((r) => (
            <button
              key={r.round}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onReprint(r.round);
              }}
              className="flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-slate-700 hover:bg-slate-100"
            >
              <RotateCcw size={15} className="text-slate-400" aria-hidden="true" />
              {r.token != null ? `Token ${r.token}` : `Round ${r.round}`}
              <span className="ml-auto text-xs text-slate-400">same token</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export interface TicketActions {
  start: (item: OrderItem) => Promise<unknown>;
  ready: (item: OrderItem) => Promise<unknown>;
  serve: (item: OrderItem) => Promise<unknown>;
  cancel: (item: OrderItem) => void;
  bulk: (kind: "start" | "ready" | "serve", items: OrderItem[]) => Promise<unknown>;
  send: (orderId: string) => Promise<unknown> | void;
  reprint: (orderId: string, round: number) => void;
}

export function KotTicket({
  group,
  filter,
  collapsed,
  onToggle,
  canCancel,
  actions,
}: {
  group: KotQueueGroup;
  filter: QueueFilter;
  collapsed: boolean;
  onToggle: () => void;
  canCancel: boolean;
  actions: TicketActions;
}) {
  const now = useNow(15_000);
  const [busy, setBusy] = useState<string | null>(null);
  const { order, items, tokenNumber } = group;
  const urgency = ticketUrgency(group, now);
  const style = URGENCY[urgency];
  const counts = ticketCounts(items);
  const since = sentAt(items);
  const rounds = printedRounds(items);
  const label = orderLabel(order);
  const KindIcon = KIND_ICON[label.kind] ?? Armchair;
  const visible = filter === "all" ? items : items.filter((i) => itemFilter(i) === filter);
  const hiddenCount = items.length - visible.length;
  const panelId = `kot-ticket-${order._id}`;
  const fresh = since != null && now - since < 2 * 60_000;

  async function act(key: string, fn: () => Promise<unknown> | void) {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  const waitingItems = items.filter((i) => itemFilter(i) === "waiting");
  const cookingItems = items.filter((i) => itemFilter(i) === "cooking");
  const readyItems = items.filter((i) => itemFilter(i) === "ready");

  return (
    <article
      aria-label={`${tokenNumber != null ? `Token ${tokenNumber}, ` : ""}${label.place}`}
      className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card ${style.ring}`}
    >
      <div className={`h-1.5 ${style.stripe}`} aria-hidden="true" />
      <div className="flex items-start gap-2 py-2 pr-2 pl-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 items-start gap-3 rounded-lg p-1.5 text-left transition-colors hover:bg-slate-50"
        >
          {tokenNumber != null ? (
            <span className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-slate-900 leading-none text-white">
              <span className="text-[9px] font-semibold tracking-widest text-slate-400">TOKEN</span>
              <span className="mt-1 text-2xl font-bold tabular-nums">{tokenNumber}</span>
            </span>
          ) : (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-slate-300 text-[11px] font-bold tracking-wide text-slate-400">
              NEW
            </span>
          )}
          <span className="min-w-0 flex-1 pt-0.5">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-base font-bold text-slate-900">{label.place}</span>
              {fresh && (
                <span className="rounded-md bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-orange-700">
                  NEW
                </span>
              )}
            </span>
            <span className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
              <KindIcon size={13} aria-hidden="true" />
              <span className="truncate">
                {label.kind}
                {label.detail ? ` · ${label.detail}` : ""}
              </span>
            </span>
            {collapsed && (
              <span className="mt-2 block">
                <span className="flex h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                  {counts.ready > 0 && (
                    <span className="bg-emerald-500" style={{ width: `${(counts.ready / counts.total) * 100}%` }} />
                  )}
                  {counts.cooking > 0 && (
                    <span className="bg-sky-500" style={{ width: `${(counts.cooking / counts.total) * 100}%` }} />
                  )}
                  {counts.waiting > 0 && (
                    <span className="bg-amber-400" style={{ width: `${(counts.waiting / counts.total) * 100}%` }} />
                  )}
                </span>
                <span className="mt-1 block text-xs font-medium text-slate-600">
                  {[
                    `${counts.total} item${counts.total === 1 ? "" : "s"}`,
                    counts.ready && `${counts.ready} ready`,
                    counts.cooking && `${counts.cooking} cooking`,
                    counts.waiting && `${counts.waiting} waiting`,
                    counts.unsent && `${counts.unsent} not sent`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            )}
          </span>
          <span className="sr-only">{collapsed ? "Show items" : "Hide items"}</span>
        </button>
        <div className="flex shrink-0 flex-col items-end gap-1 pt-1.5">
          <Timer since={since} urgency={urgency} />
          <div className="flex items-center">
            {rounds.length > 0 && (
              <TicketMenu rounds={rounds} onReprint={(round) => actions.reprint(order._id, round)} />
            )}
            <button
              type="button"
              onClick={onToggle}
              aria-label={collapsed ? "Show items" : "Hide items"}
              title={collapsed ? "Show items" : "Hide items"}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 sm:h-8 sm:w-8"
            >
              <ChevronDown
                size={18}
                className={`transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
      </div>

      <div id={panelId} hidden={collapsed}>
        <ul className="border-t border-slate-100">
          {visible.map((item) => {
            const state = itemFilter(item);
            const look = ITEM_STATE[state];
            const extras = [...(item.modifiers?.map((m) => m.label) ?? []), item.note].filter(Boolean).join(", ");
            return (
              <li
                key={item._id}
                className={`flex items-start gap-3 border-b border-l-4 border-b-slate-100 py-2.5 pr-3 pl-3 last:border-b-0 ${look.border} ${look.row}`}
              >
                <span className="w-8 shrink-0 pt-0.5 text-lg leading-none font-bold text-slate-900 tabular-nums">
                  {item.quantity}×
                </span>
                <div className="min-w-0 flex-1">
                  <p className="leading-snug font-semibold text-slate-900">
                    {item.foodName}
                    {item.isJain && (
                      <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 align-middle text-[10px] font-bold text-emerald-800">
                        JAIN
                      </span>
                    )}
                  </p>
                  {extras && <p className="mt-0.5 text-sm leading-snug font-medium text-orange-700">↳ {extras}</p>}
                  {(item.components ?? []).length > 0 && (
                    <ul className="mt-1 flex flex-col gap-0.5 border-l-2 border-slate-200 pl-2 text-sm text-slate-700">
                      {item.components!.map((part) => (
                        <li key={part.name}>
                          <span className="font-semibold tabular-nums">{part.quantity * item.quantity}×</span> {part.name}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className={`mt-1 text-[11px] font-bold tracking-wide uppercase ${look.text}`}>{look.label}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1 self-center">
                  {state === "waiting" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={Flame}
                      loading={busy === `start-${item._id}`}
                      onClick={() => act(`start-${item._id}`, () => actions.start(item))}
                    >
                      Start
                    </Button>
                  )}
                  {state === "cooking" && (
                    <Button
                      size="sm"
                      variant="success"
                      icon={Check}
                      loading={busy === `ready-${item._id}`}
                      onClick={() => act(`ready-${item._id}`, () => actions.ready(item))}
                    >
                      Ready
                    </Button>
                  )}
                  {state === "ready" && (
                    <Button
                      size="sm"
                      icon={HandPlatter}
                      loading={busy === `serve-${item._id}`}
                      onClick={() => act(`serve-${item._id}`, () => actions.serve(item))}
                    >
                      Serve
                    </Button>
                  )}
                  {(state === "waiting" || state === "cooking") && (
                    <IconButton
                      size="sm"
                      icon={HandPlatter}
                      label={`Mark ${item.foodName} served`}
                      onClick={() => act(`serve-${item._id}`, () => actions.serve(item))}
                    />
                  )}
                  {canCancel && (
                    <IconButton
                      size="sm"
                      icon={X}
                      label={`Cancel ${item.foodName}`}
                      className="!text-red-600 hover:!bg-red-50"
                      onClick={() => actions.cancel(item)}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {hiddenCount > 0 && (
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
            {hiddenCount} more item{hiddenCount === 1 ? "" : "s"} hidden by the filter
          </p>
        )}

        {(counts.unsent > 0 || waitingItems.length > 0 || cookingItems.length > 0 || readyItems.length > 0) && (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50/80 px-3 py-2.5">
            {counts.unsent > 0 && (
              <Button
                size="sm"
                icon={Send}
                className="flex-1"
                loading={busy === "send"}
                onClick={() => act("send", () => actions.send(order._id))}
              >
                Send to kitchen
              </Button>
            )}
            {waitingItems.length > 0 && (
              <Button
                size="sm"
                variant="secondary"
                icon={Flame}
                className="flex-1"
                loading={busy === "bulk-start"}
                onClick={() => act("bulk-start", () => actions.bulk("start", waitingItems))}
              >
                Start all
              </Button>
            )}
            {cookingItems.length > 0 && (
              <Button
                size="sm"
                variant="success"
                icon={Check}
                className="flex-1"
                loading={busy === "bulk-ready"}
                onClick={() => act("bulk-ready", () => actions.bulk("ready", cookingItems))}
              >
                All ready
              </Button>
            )}
            {readyItems.length > 0 && (
              <Button
                size="sm"
                icon={HandPlatter}
                className="flex-1"
                loading={busy === "bulk-serve"}
                onClick={() => act("bulk-serve", () => actions.bulk("serve", readyItems))}
              >
                Serve all
              </Button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
