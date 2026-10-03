import { useState } from "react";

import { cashSuggestions } from "../../../lib/cash";
import { TENDER_LABELS, type InvoiceTotals, type TenderMethod } from "../../../lib/types";
import { Dialog } from "../../../shared/ui/Dialog";
import { Button, ErrorText, Field, Input } from "../../../shared/ui/ui";
import type { OfflinePayment } from "../offline";

const METHODS: TenderMethod[] = ["cash", "upi", "card", "online"];

export function OfflineSettleDialog({
  totals,
  onClose,
  onConfirm,
}: {
  totals: InvoiceTotals;
  onClose: () => void;
  onConfirm: (payments: OfflinePayment[]) => void;
}) {
  const total = totals.grandTotal;
  const [method, setMethod] = useState<TenderMethod>("cash");
  const [tendered, setTendered] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const received = Number(tendered);
  const change = method === "cash" && tendered ? received - total : null;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Settle offline"
      description="The bill gets its invoice number when it syncs. A provisional receipt prints now."
      onSubmit={(e) => {
        e.preventDefault();
        if (method === "cash" && tendered && received < total) {
          setError("Cash received is less than the bill");
          return;
        }
        onConfirm([
          {
            method,
            amount: total,
            ...(reference.trim() && { reference: reference.trim() }),
            ...(method === "cash" && tendered && { tendered: received }),
          },
        ]);
      }}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Not yet
          </Button>
          <Button type="submit" size="lg" variant="success">
            Mark paid
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-white">
          <span className="text-sm text-slate-300">Bill total</span>
          <span className="text-2xl font-bold tabular-nums" data-testid="offline-total">
            ₹{total.toFixed(2)}
          </span>
        </div>
        <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-4 gap-1.5">
          {METHODS.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={method === m}
              onClick={() => setMethod(m)}
              className={`min-h-[44px] rounded-lg border px-2 text-sm font-semibold transition-colors ${
                method === m
                  ? "border-orange-600 bg-orange-600 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {TENDER_LABELS[m]}
            </button>
          ))}
        </div>
        {method === "cash" ? (
          <>
            <Field label="Cash received" htmlFor="offline-tendered">
              <Input
                id="offline-tendered"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                placeholder="Optional"
                value={tendered}
                onChange={(e) => setTendered(e.target.value)}
              />
            </Field>
            <div className="flex flex-wrap gap-1.5">
              {cashSuggestions(total).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTendered(String(v))}
                  className="min-h-[36px] rounded-full border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 tabular-nums hover:bg-slate-100"
                >
                  ₹{v}
                </button>
              ))}
            </div>
            {change !== null && (
              <p
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                  change < 0 ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"
                }`}
              >
                {change < 0 ? `₹${(-change).toFixed(2)} short` : `Give back ₹${change.toFixed(2)}`}
              </p>
            )}
          </>
        ) : (
          <Field label="Reference" htmlFor="offline-reference">
            <Input
              id="offline-reference"
              placeholder="UTR / last 4 digits"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>
        )}
        <ErrorText>{error}</ErrorText>
      </div>
    </Dialog>
  );
}
