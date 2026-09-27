import { Plus, Split, Trash2 } from "lucide-react";
import { useState } from "react";

import { TENDER_LABELS, type TenderMethod } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { Dialog } from "../../../shared/ui/Dialog";
import { Button, ErrorText, Field, IconButton, Input } from "../../../shared/ui/ui";
import UpiQr from "../../../shared/ui/UpiQr";
import { useSettleOrder } from "../queries";

interface Line {
  method: TenderMethod;
  amount: string;
  reference: string;
  tendered: string;
}

interface SettleDialogProps {
  open: boolean;
  orderId: string;
  total: number;
  invoiceNumber?: string;
  upi?: { upiVpa: string; upiPayeeName: string };
  onClose: () => void;
}

const METHODS = Object.keys(TENDER_LABELS) as TenderMethod[];

function money(n: number): string {
  return n.toFixed(2);
}

function toNumber(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function cashSuggestions(amount: number): number[] {
  const out = new Set<number>();
  for (const step of [10, 50, 100, 500]) {
    const up = Math.ceil(amount / step) * step;
    if (up > amount) out.add(up);
  }
  for (const note of [200, 500, 2000]) if (note > amount) out.add(note);
  return [...out].sort((a, b) => a - b).slice(0, 4);
}

export default function SettleDialog(props: SettleDialogProps) {
  if (!props.open) return null;
  return <SettleForm {...props} />;
}

function SettleForm({ orderId, total, invoiceNumber, upi, onClose }: SettleDialogProps) {
  const [lines, setLines] = useState<Line[]>([{ method: "cash", amount: money(total), reference: "", tendered: "" }]);
  const [splitCount, setSplitCount] = useState("2");
  const [error, setError] = useState<string | null>(null);
  const settle = useSettleOrder();

  const paid = lines.reduce((sum, l) => sum + toNumber(l.amount), 0);
  const remaining = Math.round((total - paid) * 100) / 100;
  const upiAmount = lines.filter((l) => l.method === "upi").reduce((sum, l) => sum + toNumber(l.amount), 0);

  function update(index: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      { method: "upi", amount: money(Math.max(remaining, 0)), reference: "", tendered: "" },
    ]);
  }

  function splitEqually() {
    const n = Math.min(Math.max(Math.floor(toNumber(splitCount)), 2), 10);
    const share = Math.floor((total / n) * 100) / 100;
    const last = Math.round((total - share * (n - 1)) * 100) / 100;
    setLines(
      Array.from({ length: n }, (_, i) => ({
        method: lines[i]?.method ?? "cash",
        amount: money(i === n - 1 ? last : share),
        reference: "",
        tendered: "",
      }))
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (Math.abs(remaining) > 0.001) {
      setError(
        remaining > 0 ? `₹${money(remaining)} is still unpaid` : `Payments are ₹${money(-remaining)} over the bill`
      );
      return;
    }
    try {
      await settle.mutateAsync({
        orderId,
        payments: lines.map((l) => ({
          method: l.method,
          amount: toNumber(l.amount),
          ...(l.reference.trim() && { reference: l.reference.trim() }),
          ...(l.method === "cash" && l.tendered.trim() && { tendered: toNumber(l.tendered) }),
        })),
      });
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  const settled = Math.abs(remaining) < 0.001;

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={`Settle ${invoiceNumber ?? "bill"}`}
      description="Take one payment, or split it across methods and people."
      onSubmit={submit}
      dismissible={!settle.isPending}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={settle.isPending}>
            Not yet
          </Button>
          <Button type="submit" size="lg" variant="success" loading={settle.isPending} disabled={!settled}>
            {settle.isPending ? "Settling..." : "Mark paid"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-white">
          <span className="text-sm text-slate-300">Bill total</span>
          <span className="text-2xl font-bold tabular-nums">₹{money(total)}</span>
        </div>

        {lines.map((line, index) => {
          const change =
            line.method === "cash" && line.tendered ? toNumber(line.tendered) - toNumber(line.amount) : null;
          return (
            <div key={index} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <div
                  role="radiogroup"
                  aria-label={`Payment ${index + 1} method`}
                  className="ui-scroll-x -mx-1 flex min-w-0 gap-1.5 overflow-x-auto px-1"
                >
                  {METHODS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={line.method === m}
                      onClick={() => update(index, { method: m })}
                      className={`min-h-[40px] shrink-0 rounded-lg border px-3 text-sm font-semibold transition-colors ${
                        line.method === m
                          ? "border-orange-600 bg-orange-600 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {TENDER_LABELS[m]}
                    </button>
                  ))}
                </div>
                {lines.length > 1 && (
                  <IconButton
                    icon={Trash2}
                    label={`Remove payment ${index + 1}`}
                    className="!text-red-600 hover:!bg-red-50"
                    onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                  />
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Amount (₹)" htmlFor={`settle-amount-${index}`}>
                  <Input
                    id={`settle-amount-${index}`}
                    className="text-lg font-semibold tabular-nums"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min={0}
                    value={line.amount}
                    onChange={(e) => update(index, { amount: e.target.value })}
                  />
                </Field>
                {line.method === "cash" ? (
                  <Field label="Cash received" htmlFor={`settle-tendered-${index}`}>
                    <Input
                      id={`settle-tendered-${index}`}
                      className="text-lg tabular-nums"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min={0}
                      placeholder="Optional"
                      value={line.tendered}
                      onChange={(e) => update(index, { tendered: e.target.value })}
                    />
                  </Field>
                ) : (
                  <Field label="Reference" htmlFor={`settle-reference-${index}`}>
                    <Input
                      id={`settle-reference-${index}`}
                      placeholder="UTR / last 4 digits"
                      value={line.reference}
                      onChange={(e) => update(index, { reference: e.target.value })}
                    />
                  </Field>
                )}
              </div>
              {line.method === "cash" && toNumber(line.amount) > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {cashSuggestions(toNumber(line.amount)).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => update(index, { tendered: String(v) })}
                      className="min-h-[36px] rounded-full border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 tabular-nums hover:bg-slate-100"
                    >
                      ₹{v}
                    </button>
                  ))}
                </div>
              )}
              {change !== null && (
                <p
                  className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                    change < 0 ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"
                  }`}
                >
                  {change < 0 ? `₹${money(-change)} short` : `Give back ₹${money(change)}`}
                </p>
              )}
            </div>
          );
        })}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" icon={Plus} onClick={addLine}>
            Add payment
          </Button>
          <span className="text-sm text-slate-500">or split equally between</span>
          <Input
            id="settle-split-count"
            aria-label="Number of people"
            className="!w-20"
            type="number"
            inputMode="numeric"
            min={2}
            max={10}
            value={splitCount}
            onChange={(e) => setSplitCount(e.target.value)}
          />
          <Button type="button" variant="secondary" icon={Split} onClick={splitEqually}>
            Split
          </Button>
        </div>

        <p
          className={`rounded-lg px-3 py-2 text-sm font-semibold tabular-nums ${
            settled ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"
          }`}
        >
          {settled
            ? "Payments match the bill"
            : remaining > 0
              ? `₹${money(remaining)} left to collect`
              : `₹${money(-remaining)} over the bill`}
        </p>

        {upi?.upiVpa && upiAmount > 0 && (
          <UpiQr vpa={upi.upiVpa} payee={upi.upiPayeeName} amount={upiAmount} note={invoiceNumber ?? "Bill"} />
        )}

        <ErrorText>{error}</ErrorText>
      </div>
    </Dialog>
  );
}
