import { Printer } from "lucide-react";
import { useState, type ReactNode } from "react";

import type { OrderDetailResponse, OrderItem } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { useSetExtraCharge, useSetPackagingWaived, useSetServiceCharge } from "../../orders/queries";
import { refundState } from "../../orders/status";
import { Badge, Button, Input } from "../../../shared/ui/ui";
import { WhatsAppBillButton } from "../../customers/components/CustomerPanel";
import BillActions from "../../orders/components/BillActions";
import { draftLineTotal, type DraftLine } from "../api";
import { CouponRow } from "./CouponDialog";

const rupees = (n: number) => `₹${n.toFixed(2)}`;

function kitchenBadge(item: OrderItem, payFirst: boolean, cafe = false) {
  if (item.status === "cancelled") return <Badge tone="red">Cancelled</Badge>;
  if (item.status === "served") return <Badge tone="green">Served</Badge>;
  if (item.status === "ready") return <Badge tone="green">Ready</Badge>;
  if (item.status === "preparing") return <Badge tone="blue">Cooking</Badge>;
  if (item.kotRound != null)
    return (
      <Badge tone="amber">
        KOT {item.tokenNumber != null ? `T${item.tokenNumber}` : ""}
      </Badge>
    );
  // Cafe flow: an unsent item is simply waiting for payment.
  if (cafe) return <Badge tone="amber">Awaiting payment</Badge>;
  return <Badge tone="gray">{payFirst ? "Not paid yet" : "Not sent"}</Badge>;
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex justify-between tabular-nums ${strong ? "text-base font-bold text-slate-900" : "text-slate-600"}`}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

/** Row with a small button on the right, for a charge cashiers can take off the bill or add. */
function ChargeRow({
  label,
  value,
  actionLabel,
  busy,
  onAction,
}: {
  label: string;
  value: string;
  actionLabel?: string;
  busy: boolean;
  onAction?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 tabular-nums text-slate-600">
      <span className="min-w-0 truncate">{label}</span>
      <span className="flex shrink-0 items-center gap-2">
        {value}
        {actionLabel && (
          <button
            type="button"
            disabled={busy}
            onClick={onAction}
            className="rounded-md border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {actionLabel}
          </button>
        )}
      </span>
    </div>
  );
}

/** Service charge, packaging and the extra charges of a saved order, removable and addable while it is open. */
function ChargeRows({ detail, editable }: { detail: OrderDetailResponse; editable: boolean }) {
  const { order, totals } = detail;
  const serviceCharge = useSetServiceCharge();
  const packaging = useSetPackagingWaived();
  const extra = useSetExtraCharge();
  const [error, setError] = useState<string | null>(null);
  const busy = serviceCharge.isPending || packaging.isPending || extra.isPending;

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <>
      {((totals.serviceCharge ?? 0) > 0 || order.serviceChargeWaived) && (
        <ChargeRow
          label="Service charge"
          value={order.serviceChargeWaived ? "removed" : rupees(totals.serviceCharge ?? 0)}
          actionLabel={editable ? (order.serviceChargeWaived ? "Add back" : "Remove") : undefined}
          busy={busy}
          onAction={() => run(() => serviceCharge.mutateAsync({ orderId: order._id, waived: !order.serviceChargeWaived }))}
        />
      )}
      {((totals.packagingCharge ?? 0) > 0 || order.packagingWaived) && (
        <ChargeRow
          label="Packaging"
          value={order.packagingWaived ? "removed" : rupees(totals.packagingCharge ?? 0)}
          actionLabel={editable ? (order.packagingWaived ? "Add back" : "Remove") : undefined}
          busy={busy}
          onAction={() => run(() => packaging.mutateAsync({ orderId: order._id, waived: !order.packagingWaived }))}
        />
      )}
      {editable
        ? (detail.extraChargeOptions ?? []).map((charge) => (
            <ChargeRow
              key={charge.key}
              label={charge.name}
              value={
                charge.applied
                  ? rupees((totals.extraCharges ?? []).find((c) => c.name === charge.name)?.amount ?? 0)
                  : charge.type === "percent"
                    ? `${charge.value}%`
                    : rupees(charge.value)
              }
              actionLabel={charge.applied ? "Remove" : "Add"}
              busy={busy}
              onAction={() =>
                run(() => extra.mutateAsync({ orderId: order._id, key: charge.key, applied: !charge.applied }))
              }
            />
          ))
        : (totals.extraCharges ?? []).map((c) => (
            <ChargeRow key={c.name} label={c.name} value={rupees(c.amount)} busy={false} />
          ))}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </>
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
  onDraftEdit,
  onDraftComplimentary,
  onTogglePacked,
  onCancelItem,
  onCancelOrder,
  onCancelSent,
  onCancelSentItem,
  onSavedComplimentary,
  onBillBoth,
  onSettleBoth,
  onPrintInvoice,
  paid,
  onSaveKot,
  onHold,
  onBill,
  onSettle,
  busy,
  payFirst = false,
  phone = false,
  offline = false,
  offlineTotal = null,
  cafe = false,
  settleBlock = null,
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
  /** Opens the dish dialog on a new line to change its options, Jain or spice, comment and quantity. */
  onDraftEdit?: (line: DraftLine) => void;
  /** Staff can make a new dish complimentary (or charge for it again) before the order is saved. */
  onDraftComplimentary?: (line: DraftLine) => void;
  /** Staff can mark a saved line to be packed (or not) while the order is open. */
  onTogglePacked?: (item: OrderItem) => void;
  /** Staff can take a saved line off the order while the kitchen has not got it yet (held takeaways, bills left to pay). */
  onCancelItem?: (item: OrderItem) => void;
  /** Cancel an open order that has no dishes left (all removed), instead of leaving it running. */
  onCancelOrder?: () => void;
  /** Cancel an order whose dishes already went to the kitchen (asks for a reason); open or billed orders only. */
  onCancelSent?: () => void;
  /** Cancel one dish the kitchen already has (asks for a reason); open orders only. */
  onCancelSentItem?: (item: OrderItem) => void;
  /** Make one plate of a saved dish (already sent or not) complimentary; asks for a reason. Open orders, staff only. */
  onSavedComplimentary?: (item: OrderItem) => void;
  /** Send what is unsent to the kitchen, make the bill, and print the KOT and the invoice as two separate slips. */
  onBillBoth?: () => void;
  /** Pay first (cafe): take the payment, which sends the KOT, then print the KOT and the invoice as two separate slips. */
  onSettleBoth?: () => void;
  /** Print the invoice of a paid order whose invoice was never printed (a billed or open order uses the Bill button). */
  onPrintInvoice?: () => void;
  /** The order was just paid: the footer offers its invoice, the KOT with it, WhatsApp, and moving on to the next order. */
  paid?: { onPrintInvoice: () => void; onPrintBoth: () => void; onNext: () => void } | null;
  onSaveKot: () => void;
  onHold: (() => void) | null;
  onBill: () => void;
  onSettle: (() => void) | null;
  busy: boolean;
  /** Dine-in guests pay when ordering: "Pay & send" replaces "Save & KOT" and Settle. */
  payFirst?: boolean;
  phone?: boolean;
  offline?: boolean;
  offlineTotal?: number | null;
  /** Cafe flow: pay first. One Pay & send KOT button; no separate KOT or bill buttons. */
  cafe?: boolean;
  /**
   * Paying after eating: the bill can't be settled until every dish is served. `waiting` counts the dishes not served
   * yet; `canServe` says whether the sent ones can be marked served from here (the rest still have to be sent).
   */
  settleBlock?: { waiting: number; unsent: number; onServeAll: (() => void) | null } | null;
  className?: string;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const order = detail?.order ?? null;
  const savedItems = detail?.items ?? [];
  const draftSubtotal = draft.reduce((sum, line) => sum + draftLineTotal(line), 0);
  // One plate of a dish can be complimentary in an order: the button goes once a plate of that dish already is.
  const freeDishes = new Set(draft.filter((l) => l.complimentary).map((l) => l.item._id));
  const unsent = savedItems.filter(
    (i) => i.kotRound == null && i.status !== "cancelled",
  ).length;
  const isOpen = !order || order.status === "open";
  // Leaving an order at the counter to be paid there (captain, cafe flow): also fine when it was already billed and the
  // payment dialog was closed without paying; there is nothing left to save then, the order just stays awaiting payment.
  const canLeaveAtCounter =
    isOpen
      ? draft.length > 0 || unsent > 0
      : order?.status === "billed" && draft.length === 0;
  const nothing = savedItems.length === 0 && draft.length === 0;
  const totals = detail?.totals;

  return (
    <aside
      className={`flex h-full min-h-0 shrink-0 flex-col border-slate-200 bg-white ${className}`}
    >
      <div className="border-b border-slate-200 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <h2
            className="truncate text-lg font-bold text-slate-800"
            data-testid="pos-order-title"
          >
            {title}
          </h2>
          {offline ? (
            <Badge tone="amber">Offline</Badge>
          ) : (
            order && (
              <Badge
                tone={
                  order.status === "billed"
                    ? "blue"
                    : order.status === "closed"
                      ? "green"
                      : "amber"
                }
              >
                {order.status === "billed"
                  ? (order.invoiceNumber ?? "Billed")
                  : order.status === "closed"
                    ? refundState(order) === "full"
                      ? "Refunded"
                      : refundState(order) === "partial"
                        ? "Partly refunded"
                        : "Paid"
                    : "Open"}
              </Badge>
            )
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
        {nothing && (
          <p className="py-8 text-center text-sm text-slate-400">{emptyText}</p>
        )}
        {order && isOpen && onCancelOrder && draft.length === 0 && savedItems.every((i) => i.status === "cancelled") && (
          <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm" data-testid="empty-order-panel">
            <p className="text-slate-600">This order has no dishes. Add some, or cancel it.</p>
            <Button variant="secondary" className="mt-2" onClick={onCancelOrder} disabled={busy}>
              Cancel this empty order
            </Button>
          </div>
        )}
        {order &&
          onCancelSent &&
          !offline &&
          !paid &&
          (order.status === "open" || order.status === "billed") &&
          savedItems.some((i) => i.kotRound != null && i.status !== "cancelled") && (
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-40"
                disabled={busy}
                onClick={onCancelSent}
              >
                Cancel this order…
              </button>
            </div>
          )}
        <ul className="flex flex-col divide-y divide-slate-100">
          {savedItems.map((item) => (
            <li
              key={item._id}
              className={`flex items-start gap-2 py-2 text-sm ${item.status === "cancelled" ? "opacity-50" : ""}`}
            >
              <span className="w-7 shrink-0 text-right font-semibold tabular-nums">
                {item.quantity}×
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate ${item.status === "cancelled" ? "line-through" : ""}`}
                >
                  {item.foodName}
                </span>
                {(item.modifiers?.length ?? 0) > 0 && (
                  <span className="block truncate text-xs text-slate-500">
                    {item.modifiers!.map((m) => m.label).join(", ")}
                  </span>
                )}
                <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  {kitchenBadge(item, payFirst, cafe)}
                  {item.isPacked && <Badge tone="blue">Pack</Badge>}
                  {item.complimentary && item.status !== "cancelled" && <Badge tone="green">Complimentary</Badge>}
                  {onTogglePacked && item.status !== "cancelled" && isOpen && (
                    <button
                      type="button"
                      className="text-xs text-slate-500 underline"
                      onClick={() => onTogglePacked(item)}
                    >
                      {item.isPacked ? "Unpack" : "Pack"}
                    </button>
                  )}
                  {onSavedComplimentary &&
                    order &&
                    isOpen &&
                    !offline &&
                    item.status !== "cancelled" &&
                    !item.complimentary &&
                    !savedItems.some(
                      (i) => i.complimentary && i.status !== "cancelled" && i.foodItemId === item.foodItemId,
                    ) && (
                      <button
                        type="button"
                        className="text-xs font-medium text-slate-600 hover:underline"
                        aria-label={`Make ${item.foodName} complimentary`}
                        disabled={busy}
                        onClick={() => onSavedComplimentary(item)}
                      >
                        {item.quantity > 1 ? "1 complimentary…" : "Complimentary…"}
                      </button>
                    )}
                  {onCancelSentItem && order && isOpen && !offline && item.status !== "cancelled" && item.kotRound != null && (
                    <button
                      type="button"
                      className="text-xs text-red-600 hover:underline"
                      aria-label={`Cancel ${item.foodName}`}
                      disabled={busy}
                      onClick={() => onCancelSentItem(item)}
                    >
                      Cancel
                    </button>
                  )}
                  {onCancelItem && isOpen && item.status !== "cancelled" && item.kotRound == null && (
                    <button
                      type="button"
                      className="text-xs text-red-600 hover:underline"
                      aria-label={`Remove ${item.foodName}`}
                      onClick={() => onCancelItem(item)}
                    >
                      Remove
                    </button>
                  )}
                </span>
              </span>
              <span className="shrink-0 tabular-nums">
                {rupees(item.total)}
              </span>
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
                <span className="w-6 text-center font-semibold tabular-nums">
                  {line.quantity}
                </span>
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
                {(line.modifiers.length > 0 ||
                  line.note ||
                  line.isJain ||
                  line.isPacked ||
                  line.complimentary) && (
                  <span className="block truncate text-xs text-slate-500">
                    {[
                      line.isJain ? "Jain" : "",
                      line.isPacked ? "Pack" : "",
                      line.complimentary ? `Complimentary: ${line.complimentaryReason ?? ""}` : "",
                      ...line.modifiers.map((m) => m.label),
                      line.note,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                )}
                <span className="text-xs font-medium text-orange-700">New</span>
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <span className="tabular-nums">
                  {rupees(draftLineTotal(line))}
                </span>
                <span className="flex gap-3">
                  {onDraftComplimentary && !offline && (line.complimentary || !freeDishes.has(line.item._id)) && (
                    <button
                      type="button"
                      aria-pressed={!!line.complimentary}
                      aria-label={`${line.complimentary ? "Charge for" : "Make complimentary"} ${line.item.name}`}
                      className={`text-xs font-medium hover:underline ${line.complimentary ? "text-green-700" : "text-slate-600"}`}
                      onClick={() => onDraftComplimentary(line)}
                    >
                      {line.complimentary ? "Charge" : line.quantity > 1 ? "1 complimentary…" : "Complimentary…"}
                    </button>
                  )}
                  {onDraftEdit && (
                    <button
                      type="button"
                      aria-label={`Customize ${line.item.name}`}
                      className="text-xs font-medium text-orange-700 hover:underline"
                      onClick={() => onDraftEdit(line)}
                    >
                      Customize
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-xs text-red-600 hover:underline"
                    onClick={() => onDraftRemove(line.key)}
                  >
                    Remove
                  </button>
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-slate-200 px-3 py-2 text-sm">
        {draft.length > 0 && (
          <Row label="New items" value={rupees(draftSubtotal)} />
        )}
        {totals && savedItems.length > 0 && (
          <>
            <Row label="Subtotal" value={rupees(totals.subtotal)} />
            {order && isOpen && !offline && !paid && (
              <CouponRow order={order} subtotal={totals.subtotal} discount={totals.couponDiscount ?? 0} />
            )}
            {/* The coupon has its own row while the order is open; any other discount shows here. */}
            {(() => {
              const shown = order && isOpen && !offline && !paid ? (totals.couponDiscount ?? 0) : 0;
              const other = totals.discount - shown;
              return other > 0.005 ? <Row label="Discount" value={`−${rupees(other)}`} /> : null;
            })()}
            {detail && (
              <ChargeRows
                detail={detail}
                editable={isOpen && !offline && !!order}
              />
            )}
            {totals.taxLines.map((t) => (
              <Row
                key={t.name}
                label={`${t.name} ${t.percent}%`}
                value={rupees(t.amount)}
              />
            ))}
            {totals.roundOff !== 0 && (
              <Row label="Round off" value={rupees(totals.roundOff)} />
            )}
            {!offline && (
              <Row
                label={draft.length > 0 ? "Saved total" : "Total"}
                value={rupees(totals.grandTotal)}
                strong
              />
            )}
          </>
        )}
        {offline && offlineTotal !== null && (
          <Row label="Total with tax" value={rupees(offlineTotal)} strong />
        )}
        {!offline && !totals && draft.length > 0 && (
          <p className="text-xs text-slate-400">
            Tax is added when the order is saved.
          </p>
        )}
      </div>

      {paid && order?.status === "closed" && (
        <div className="border-t border-green-200 bg-green-50 p-3" data-testid="paid-footer">
          <p className="text-sm font-semibold text-green-900">
            Paid{order.invoiceNumber ? ` · ${order.invoiceNumber}` : ""}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {/* Always available, so the invoice can be printed again: it reads Reprint once it has been printed. */}
            <Button variant="secondary" icon={Printer} onClick={paid.onPrintInvoice} disabled={busy}>
              {order.invoicePrintedAt ? "Reprint invoice" : "Print invoice"}
            </Button>
            <Button
              variant="secondary"
              icon={Printer}
              onClick={paid.onPrintBoth}
              disabled={busy}
              title="The KOT and the invoice print as two separate slips"
            >
              KOT + invoice
            </Button>
            <div className="col-span-2">
              <WhatsAppBillButton
                key={order._id}
                orderId={order._id}
                compact
                hasPhone={!!order.customerPhone?.replace(/\D/g, "")}
              />
            </div>
            <Button className="col-span-2" onClick={paid.onNext}>
              New order
            </Button>
          </div>
        </div>
      )}
      <div className={`grid grid-cols-2 gap-2 border-t border-slate-200 p-3 ${paid && order?.status === "closed" ? "hidden" : ""}`}>
        {cafe && !offline ? (
          <>
            {onSettle ? (
              <>
                {/* Payment and KOT + invoice: two different buttons on one row (the captain's phone keeps one). */}
                <Button
                  size={!phone && onSettleBoth ? "md" : "lg"}
                  className={`${!phone && onSettleBoth ? "" : "col-span-2"} !bg-green-600 hover:!bg-green-700`}
                  onClick={onSettle}
                  disabled={busy || nothing || order?.status === "closed"}
                  title="F10"
                  data-testid="settle-button"
                >
                  Pay &amp; send KOT{" "}
                  {!phone && <kbd className="text-[10px] opacity-70">F10</kbd>}
                </Button>
                {!phone && onSettleBoth && (
                  <Button
                    variant="secondary"
                    icon={Printer}
                    onClick={onSettleBoth}
                    disabled={busy || nothing || order?.status === "closed"}
                    title="Take the payment, send the KOT, and print the KOT and the invoice as two separate slips"
                  >
                    KOT + invoice
                  </Button>
                )}
                {phone && (
                  <Button
                    variant="secondary"
                    className="col-span-2"
                    onClick={onSaveKot}
                    disabled={busy || !canLeaveAtCounter}
                  >
                    Send to the counter to pay there
                  </Button>
                )}
              </>
            ) : (
              <Button
                size="lg"
                className="col-span-2"
                onClick={onSaveKot}
                disabled={busy || !canLeaveAtCounter}
              >
                Send order to the counter
              </Button>
            )}
            {/* The invoice can be made and printed before it is paid: it shows the amount to pay and the UPI QR. */}
            {!phone && onSettle && order?.status !== "closed" && (
              <Button
                variant="secondary"
                icon={Printer}
                className="col-span-2"
                onClick={onBill}
                disabled={busy || nothing}
                title="Make the invoice before the payment and print it with the amount to pay and a UPI QR (F9)"
              >
                {order?.status === "billed" ? "Reprint invoice" : "Print invoice"}{" "}
                <kbd className="text-[10px] opacity-70">F9</kbd>
              </Button>
            )}
            {onHold ? (
              <Button
                variant="secondary"
                className="col-span-2"
                onClick={onHold}
                disabled={busy || draft.length === 0}
              >
                Hold (pay later)
              </Button>
            ) : (
              <Button
                variant="secondary"
                className="col-span-2"
                onClick={() => setMoreOpen((v) => !v)}
                disabled={!order}
              >
                {moreOpen ? "Hide options" : "More"}
              </Button>
            )}
          </>
        ) : (
          <>
            {payFirst && onSettle ? (
              <Button
                className="!bg-green-600 hover:!bg-green-700"
                onClick={onSettle}
                disabled={busy || nothing || order?.status === "closed"}
                title="F8 or F10"
              >
                Pay & send{" "}
                {!phone && <kbd className="text-[10px] opacity-70">F10</kbd>}
              </Button>
            ) : (
              <Button
                onClick={onSaveKot}
                disabled={
                  busy || !isOpen || (draft.length === 0 && unsent === 0)
                }
                title="F8"
              >
                {phone ? "Send KOT" : "Save & KOT"}{" "}
                {!phone && <kbd className="text-[10px] opacity-70">F8</kbd>}
              </Button>
            )}
            {onHold ? (
              <Button
                variant="secondary"
                onClick={onHold}
                disabled={busy || draft.length === 0}
              >
                Hold
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={() => setMoreOpen((v) => !v)}
                disabled={!order || offline}
              >
                {moreOpen ? "Hide options" : "More"}
              </Button>
            )}
            {/* A paid order has nothing left to bill, so it has no payment and no invoice buttons here. */}
            {phone ? (
              <>
                {order?.status !== "closed" && (
                  <Button variant="secondary" onClick={onBill} disabled={busy || nothing} title="Ask for the bill">
                    {order?.status === "billed" ? "Reprint bill" : "Request bill"}
                  </Button>
                )}
                {onSettle && !payFirst && order?.status !== "closed" && (
                  <Button
                    className="!bg-green-600 hover:!bg-green-700"
                    onClick={onSettle}
                    disabled={busy || nothing || !!settleBlock}
                    title={settleBlock ? "Serve every dish first" : undefined}
                  >
                    Settle
                  </Button>
                )}
              </>
            ) : (
              order?.status !== "closed" && (
                <>
                  {/* Payment and KOT + invoice are two different buttons on one row. */}
                  {onSettle && !payFirst && (
                    <Button
                      className="!bg-green-600 hover:!bg-green-700"
                      onClick={onSettle}
                      disabled={busy || nothing || !!settleBlock}
                      title={settleBlock ? "Serve every dish first" : "Take the payment (F10)"}
                      data-testid="settle-button"
                    >
                      Settle <kbd className="text-[10px] opacity-70">F10</kbd>
                    </Button>
                  )}
                  {onBillBoth && (
                    <Button
                      variant="secondary"
                      icon={Printer}
                      onClick={onBillBoth}
                      disabled={busy || nothing}
                      title="Send the KOT, make the bill, and print the KOT and the invoice as two separate slips"
                    >
                      KOT + invoice
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    icon={Printer}
                    className="col-span-2"
                    onClick={onBill}
                    disabled={busy || nothing}
                    title="Make the bill if it is not made yet, and print the invoice (F9)"
                  >
                    {order?.status === "billed" ? "Reprint invoice" : "Print invoice"}{" "}
                    <kbd className="text-[10px] opacity-70">F9</kbd>
                  </Button>
                </>
              )
            )}
            {settleBlock && (
              <div
                className="col-span-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"
                data-testid="serve-first"
              >
                <span>
                  {settleBlock.waiting} dish{settleBlock.waiting === 1 ? "" : "es"} not served yet.
                  {settleBlock.unsent > 0 ? " Send the new ones to the kitchen first." : " Settle once everything is served."}
                </span>
                {settleBlock.onServeAll && (
                  <Button size="sm" variant="secondary" disabled={busy} onClick={settleBlock.onServeAll}>
                    Mark all served
                  </Button>
                )}
              </div>
            )}
          </>
        )}
        {!phone &&
          order &&
          !offline &&
          order.invoiceNumber &&
          (order.status === "billed" || order.status === "closed") && (
            <>
              {/* A paid order: its invoice can be printed here, and again after it was printed (it reads Reprint). */}
              {order.status === "closed" && onPrintInvoice && (
                <Button
                  variant="secondary"
                  icon={Printer}
                  className="col-span-2"
                  onClick={onPrintInvoice}
                  disabled={busy}
                  data-testid="print-invoice-paid"
                >
                  {order.invoicePrintedAt ? "Reprint invoice" : "Print invoice"}
                </Button>
              )}
              <div className="col-span-2">
                <WhatsAppBillButton
                  key={order._id}
                  orderId={order._id}
                  compact
                  hasPhone={!!order.customerPhone?.replace(/\D/g, "")}
                />
              </div>
            </>
          )}
        {/* Pay first (cafe, or paid before the kitchen): the bill is not split, merged or discounted here. */}
        {onHold && order && !offline && !cafe && !payFirst && (
          <Button
            variant="secondary"
            className="col-span-2"
            onClick={() => setMoreOpen((v) => !v)}
          >
            {moreOpen ? "Hide options" : "Split, merge, discount…"}
          </Button>
        )}
      </div>
      {moreOpen && detail && !offline && (
        <div className="max-h-64 overflow-y-auto border-t border-slate-200 p-3">
          <BillActions data={detail} />
        </div>
      )}
    </aside>
  );
}
