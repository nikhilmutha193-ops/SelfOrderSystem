import { useMemo, useState } from "react";

import {
  REFUND_REASON_LABELS,
  TENDER_LABELS,
  type PaymentMethod,
  type RefundMethod,
  type RefundReason,
} from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { Dialog } from "../../../shared/ui/Dialog";
import { Button, ErrorText, Field, Input, Select, Textarea } from "../../../shared/ui/ui";
import { useCreateRefund, useRefundSummary } from "../queries";

const METHODS: RefundMethod[] = ["cash", "upi", "card", "online", "wallet"];
const REASONS = Object.keys(REFUND_REASON_LABELS) as RefundReason[];

const rupees = (n: number) => `₹${n.toFixed(2)}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Gives money back on a paid bill. Pick the items (and how many) the guest no longer wants, or enter an
 * amount agreed at the till. Refunded items leave the kitchen's list, and cash refunds come out of the drawer.
 */
export function RefundDialog({
  orderId,
  open,
  onClose,
  paidWith,
}: {
  orderId: string;
  open: boolean;
  onClose: () => void;
  /** How the bill was paid, to preselect the same method for the refund. */
  paidWith?: PaymentMethod;
}) {
  if (!open) return null;
  return <RefundForm orderId={orderId} onClose={onClose} paidWith={paidWith} />;
}

function RefundForm({
  orderId,
  onClose,
  paidWith,
}: {
  orderId: string;
  onClose: () => void;
  paidWith?: PaymentMethod;
}) {
  const summary = useRefundSummary(orderId, true).data;
  const create = useCreateRefund();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [override, setOverride] = useState("");
  const [method, setMethod] = useState<RefundMethod>(
    METHODS.includes(paidWith as RefundMethod) ? (paidWith as RefundMethod) : "cash",
  );
  const [reason, setReason] = useState<RefundReason>("customer_cancelled");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const chosen = useMemo(
    () => (summary?.items ?? []).filter((i) => (quantities[i._id] ?? 0) > 0),
    [summary, quantities],
  );
  const worked = round2(chosen.reduce((sum, i) => sum + i.unitRefund * (quantities[i._id] ?? 0), 0));
  const amount = override.trim() !== "" ? Number(override) : worked;
  const refundable = summary?.refundable ?? 0;
  const valid = Number.isFinite(amount) && amount > 0 && amount <= refundable + 0.001;

  function step(id: string, delta: number, max: number) {
    setQuantities((q) => ({ ...q, [id]: Math.max(0, Math.min(max, (q[id] ?? 0) + delta)) }));
    setOverride("");
  }

  async function submit() {
    if (!summary) return;
    setError(null);
    if (!valid) return setError(`Enter an amount between ₹0.01 and ${rupees(refundable)}`);
    try {
      await create.mutateAsync({
        orderId,
        ...(chosen.length > 0 && {
          items: chosen.map((i) => ({ itemId: i._id, quantity: quantities[i._id] })),
        }),
        ...((chosen.length === 0 || override.trim() !== "") && { amount: round2(amount) }),
        method,
        reason,
        ...(note.trim() && { note: note.trim() }),
      });
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Refund ${summary?.invoiceNumber ?? "bill"}`}
      description="Give money back for items the guest no longer wants, or an amount agreed at the till."
      onSubmit={submit}
      dismissible={!create.isPending}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending} disabled={!valid || !summary}>
            {valid ? `Refund ${rupees(amount)}` : "Refund"}
          </Button>
        </>
      }
    >
      {!summary ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : !summary.canRefund ? (
        <p className="text-sm text-slate-600">Only a paid bill can be refunded.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2 text-center text-xs font-medium">
            <span className="rounded-lg border border-slate-200 bg-white py-1.5 text-slate-700">
              <b className="block text-sm tabular-nums">{rupees(summary.paid)}</b>Paid
            </span>
            <span className="rounded-lg border border-slate-200 bg-white py-1.5 text-slate-700">
              <b className="block text-sm tabular-nums">{rupees(summary.refunded)}</b>Refunded
            </span>
            <span className="rounded-lg border border-orange-300 bg-orange-50 py-1.5 text-orange-900">
              <b className="block text-sm tabular-nums">{rupees(summary.refundable)}</b>Can refund
            </span>
          </div>

          {summary.items.some((i) => i.refundableQty > 0) && (
            <div>
              <p className="mb-1.5 text-sm font-semibold text-slate-800">Items to refund</p>
              <ul className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-200">
                {summary.items
                  .filter((i) => i.refundableQty > 0)
                  .map((item) => {
                    const qty = quantities[item._id] ?? 0;
                    return (
                      <li key={item._id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-slate-900">{item.foodName}</span>
                          <span className="block text-xs text-slate-500">
                            {item.quantity} ordered
                            {item.refundedQty > 0 ? `, ${item.refundedQty} refunded` : ""} · {rupees(item.unitRefund)}{" "}
                            each, with tax
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            aria-label={`One less ${item.foodName}`}
                            disabled={qty === 0}
                            onClick={() => step(item._id, -1, item.refundableQty)}
                            className="h-9 w-9 rounded-md border border-slate-200 text-lg font-bold text-slate-700 disabled:opacity-40"
                          >
                            −
                          </button>
                          <span className="w-6 text-center font-semibold tabular-nums">{qty}</span>
                          <button
                            type="button"
                            aria-label={`One more ${item.foodName}`}
                            disabled={qty >= item.refundableQty}
                            onClick={() => step(item._id, 1, item.refundableQty)}
                            className="h-9 w-9 rounded-md border border-slate-200 text-lg font-bold text-slate-700 disabled:opacity-40"
                          >
                            +
                          </button>
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </div>
          )}

          <Field
            label="Amount to refund (₹)"
            htmlFor="refund-amount"
            hint={
              chosen.length > 0
                ? `The chosen items come to ${rupees(worked)}. Change it only for a different amount.`
                : "No items chosen: this amount is refunded as it is."
            }
          >
            <Input
              id="refund-amount"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={override !== "" ? override : worked > 0 ? String(worked) : ""}
              onChange={(e) => setOverride(e.target.value)}
              placeholder="0.00"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Money goes back by" htmlFor="refund-method">
              <Select id="refund-method" value={method} onChange={(e) => setMethod(e.target.value as RefundMethod)}>
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {TENDER_LABELS[m]}
                    {m === "cash" ? " (comes out of the drawer)" : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Reason" htmlFor="refund-reason">
              <Select id="refund-reason" value={reason} onChange={(e) => setReason(e.target.value as RefundReason)}>
                {REASONS.map((r) => (
                  <option key={r} value={r}>
                    {REFUND_REASON_LABELS[r]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Note (optional)" htmlFor="refund-note">
            <Textarea
              id="refund-note"
              rows={2}
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </Dialog>
  );
}
