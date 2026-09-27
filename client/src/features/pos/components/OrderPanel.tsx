import { useState, type ReactNode } from "react";

import type { OrderDetailResponse, OrderItem } from "../../../lib/types";
import { Badge, Button, Input } from "../../../shared/ui/ui";
import BillActions from "../../orders/components/BillActions";
import { draftUnitPrice, type DraftLine } from "../api";

const rupees = (n: number) => `₹${n.toFixed(2)}`;

function kitchenBadge(item: OrderItem) {
  if (item.status === "cancelled") return <Badge tone="red">Cancelled</Badge>;
  if (item.status === "served") return <Badge tone="green">Served</Badge>;
  if (item.status === "ready") return <Badge tone="green">Ready</Badge>;
  if (item.status === "preparing") return <Badge tone="blue">Cooking</Badge>;
  if (item.kotRound != null)
    return <Badge tone="amber">KOT {item.tokenNumber != null ? `T${item.tokenNumber}` : ""}</Badge>;
  return <Badge tone="gray">Not sent</Badge>;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={`flex justify-between tabular-nums ${strong ? "text-base font-bold text-slate-900" : "text-slate-600"}`}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function OrderPanel({
  title,
  emptyText = "Tap dishes to add them.",
  headerExtra,
  detail,
  draft,
  customerName,
  onCustomerName,
  onDraftQuantity,
  onDraftRemove,
  onSaveKot,
  onHold,
  onBill,
  onSettle,
  busy,
  phone = false,
  className = "w-[340px] border-l lg:w-[390px]",
}: {
  title: string;
  emptyText?: string;
  headerExtra?: ReactNode;
  detail: OrderDetailResponse | null;
  draft: DraftLine[];
  customerName: string | null;
  onCustomerName: (value: string) => void;
  onDraftQuantity: (key: string, delta: number) => void;
  onDraftRemove: (key: string) => void;
  onSaveKot: () => void;
  onHold: (() => void) | null;
  onBill: () => void;
  onSettle: (() => void) | null;
  busy: boolean;
  phone?: boolean;
  className?: string;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const order = detail?.order ?? null;
  const savedItems = detail?.items ?? [];
  const draftSubtotal = draft.reduce((sum, line) => sum + draftUnitPrice(line) * line.quantity, 0);
  const unsent = savedItems.filter((i) => i.kotRound == null && i.status !== "cancelled").length;
  const isOpen = !order || order.status === "open";
  const nothing = savedItems.length === 0 && draft.length === 0;
  const totals = detail?.totals;

  return (
    <aside className={`flex h-full min-h-0 shrink-0 flex-col border-slate-200 bg-white ${className}`}>
      <div className="border-b border-slate-200 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate text-lg font-bold text-slate-800" data-testid="pos-order-title">
            {title}
          </h2>
          {order && (
            <Badge tone={order.status === "billed" ? "blue" : order.status === "closed" ? "green" : "amber"}>
              {order.status === "billed"
                ? (order.invoiceNumber ?? "Billed")
                : order.status === "closed"
                  ? "Paid"
                  : "Open"}
            </Badge>
          )}
        </div>
        {customerName !== null && (
          <Input
            id="pos-customer"
            className="mt-2"
            placeholder="Customer name (optional)"
            maxLength={80}
            value={customerName}
            onChange={(e) => onCustomerName(e.target.value)}
          />
        )}
        {headerExtra}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {nothing && <p className="py-8 text-center text-sm text-slate-400">{emptyText}</p>}
        <ul className="flex flex-col divide-y divide-slate-100">
          {savedItems.map((item) => (
            <li
              key={item._id}
              className={`flex items-start gap-2 py-2 text-sm ${item.status === "cancelled" ? "opacity-50" : ""}`}
            >
              <span className="w-7 shrink-0 text-right font-semibold tabular-nums">{item.quantity}×</span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate ${item.status === "cancelled" ? "line-through" : ""}`}>
                  {item.foodName}
                </span>
                {(item.modifiers?.length ?? 0) > 0 && (
                  <span className="block truncate text-xs text-slate-500">
                    {item.modifiers!.map((m) => m.label).join(", ")}
                  </span>
                )}
                <span className="mt-0.5 block">{kitchenBadge(item)}</span>
              </span>
              <span className="shrink-0 tabular-nums">{rupees(item.total)}</span>
            </li>
          ))}
          {draft.map((line) => (
            <li
              key={line.key}
              className="flex items-start gap-2 bg-orange-50/60 py-2 text-sm"
              data-testid="pos-draft-line"
            >
              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label={`One less ${line.item.name}`}
                  className="h-8 w-8 rounded-md bg-white text-lg font-bold text-slate-700 shadow-sm"
                  onClick={() => onDraftQuantity(line.key, -1)}
                >
                  −
                </button>
                <span className="w-6 text-center font-semibold tabular-nums">{line.quantity}</span>
                <button
                  type="button"
                  aria-label={`One more ${line.item.name}`}
                  className="h-8 w-8 rounded-md bg-white text-lg font-bold text-slate-700 shadow-sm"
                  onClick={() => onDraftQuantity(line.key, 1)}
                >
                  +
                </button>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{line.item.name}</span>
                {(line.modifiers.length > 0 || line.note) && (
                  <span className="block truncate text-xs text-slate-500">
                    {[...line.modifiers.map((m) => m.label), line.note].filter(Boolean).join(", ")}
                  </span>
                )}
                <span className="text-xs font-medium text-orange-700">New</span>
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <span className="tabular-nums">{rupees(draftUnitPrice(line) * line.quantity)}</span>
                <button
                  type="button"
                  className="text-xs text-red-600 hover:underline"
                  onClick={() => onDraftRemove(line.key)}
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-slate-200 px-3 py-2 text-sm">
        {draft.length > 0 && <Row label="New items" value={rupees(draftSubtotal)} />}
        {totals && savedItems.length > 0 && (
          <>
            <Row label="Subtotal" value={rupees(totals.subtotal)} />
            {totals.discount > 0 && <Row label="Discount" value={`−${rupees(totals.discount)}`} />}
            {(totals.serviceCharge ?? 0) > 0 && <Row label="Service charge" value={rupees(totals.serviceCharge!)} />}
            {totals.taxLines.map((t) => (
              <Row key={t.name} label={`${t.name} ${t.percent}%`} value={rupees(t.amount)} />
            ))}
            {totals.roundOff !== 0 && <Row label="Round off" value={rupees(totals.roundOff)} />}
            <Row label={draft.length > 0 ? "Saved total" : "Total"} value={rupees(totals.grandTotal)} strong />
          </>
        )}
        {!totals && draft.length > 0 && <p className="text-xs text-slate-400">Tax is added when the order is saved.</p>}
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-slate-200 p-3">
        <Button onClick={onSaveKot} disabled={busy || !isOpen || (draft.length === 0 && unsent === 0)} title="F8">
          {phone ? "Send KOT" : "Save & KOT"} {!phone && <kbd className="text-[10px] opacity-70">F8</kbd>}
        </Button>
        {onHold ? (
          <Button variant="secondary" onClick={onHold} disabled={busy || draft.length === 0}>
            Hold
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => setMoreOpen((v) => !v)} disabled={!order}>
            {moreOpen ? "Hide options" : "More"}
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={onBill}
          disabled={busy || nothing || order?.status === "closed"}
          title="F9"
        >
          {order?.status === "billed" ? "Reprint bill" : phone ? "Request bill" : "Bill"}{" "}
          {!phone && <kbd className="text-[10px] opacity-70">F9</kbd>}
        </Button>
        {onSettle && (
          <Button
            className="!bg-green-600 hover:!bg-green-700"
            onClick={onSettle}
            disabled={busy || nothing || order?.status === "closed"}
            title="F10"
          >
            Settle <kbd className="text-[10px] opacity-70">F10</kbd>
          </Button>
        )}
        {onHold && order && (
          <Button variant="secondary" className="col-span-2" onClick={() => setMoreOpen((v) => !v)}>
            {moreOpen ? "Hide options" : "Split, merge, discount…"}
          </Button>
        )}
      </div>
      {moreOpen && detail && (
        <div className="max-h-64 overflow-y-auto border-t border-slate-200 p-3">
          <BillActions data={detail} />
        </div>
      )}
    </aside>
  );
}
