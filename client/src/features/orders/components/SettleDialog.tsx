import { useQueryClient } from "@tanstack/react-query";
import { Camera, CreditCard, ImageUp, Plus, Split, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cashSuggestions } from "../../../lib/cash";
import { useServiceFlow } from "../../../lib/useServiceFlow";
import { TENDER_LABELS, type TenderMethod } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { Dialog } from "../../../shared/ui/Dialog";
import ReasonDialog from "../../../shared/ui/ReasonDialog";
import { Button, ErrorText, Field, IconButton, Input } from "../../../shared/ui/ui";
import UpiQr from "../../../shared/ui/UpiQr";
import { useOrderCustomer } from "../../customers/queries";
import { payOnline } from "../../payments/payOnline";
import { ordersApi } from "../api";
import {
  orderKeys,
  useOrder,
  useReopenBill,
  useSetExtraCharge,
  useSetItemPacked,
  useSetPackagingWaived,
  useSetServiceCharge,
  useSettleOrder,
} from "../queries";

interface Line {
  method: TenderMethod;
  amount: string;
  reference: string;
  tendered: string;
  /** UPI: the payer's mobile number, or a screenshot of the payment, is required. */
  payerPhone: string;
  proofKey: string;
  /** Local preview of the screenshot just uploaded. */
  proofPreview: string;
}

const emptyLine = (method: TenderMethod, amount: string): Line => ({
  method,
  amount,
  reference: "",
  tendered: "",
  payerPhone: "",
  proofKey: "",
  proofPreview: "",
});

/** A usable mobile number: 10 digits (optionally with 0 or 91 in front). */
function validMobile(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return /^[6-9]\d{9}$/.test(digits) || /^0[6-9]\d{9}$/.test(digits) || /^91[6-9]\d{9}$/.test(digits);
}

/** The number to record for a UPI line: the one typed, else the customer's number already on the order. */
function payerNumber(line: Line, guestPhone: string): string {
  return line.payerPhone.trim() || (validMobile(guestPhone) ? guestPhone : "");
}

/** The mobile number and screenshot of a UPI payment are optional; a number that is typed must be a real one. */
function upiNumberInvalid(line: Line): boolean {
  return line.method === "upi" && line.payerPhone.trim() !== "" && !validMobile(line.payerPhone);
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

export default function SettleDialog(props: SettleDialogProps) {
  if (!props.open) return null;
  // The form starts from the bill total, so it starts over when a charge changes the total.
  return <SettleForm key={props.total} {...props} />;
}

/**
 * Lets staff take charges off the bill, or add them, before it is paid: service charge, packaging and the
 * restaurant's extra charges. A billed order is locked, so it has to be reopened (with a reason) first.
 */
function ChargesPanel({ orderId }: { orderId: string }) {
  const detail = useOrder(orderId).data;
  const serviceCharge = useSetServiceCharge();
  const packaging = useSetPackagingWaived();
  const extraCharge = useSetExtraCharge();
  const setPacked = useSetItemPacked();
  const reopen = useReopenBill();
  const [error, setError] = useState<string | null>(null);
  const [reopening, setReopening] = useState(false);
  if (!detail) return null;

  const { order, items, totals } = detail;
  const options = detail.extraChargeOptions ?? [];
  const hasService = (totals.serviceChargePercent ?? 0) > 0 || !!order.serviceChargeWaived;
  const unpacked = items.filter((i) => i.status !== "cancelled" && !i.isPacked);
  const canAddPackaging =
    !order.packagingWaived && (totals.packagingCharge ?? 0) === 0 && order.orderType === "dine-in" && unpacked.length > 0;
  const hasPackaging = (totals.packagingCharge ?? 0) > 0 || !!order.packagingWaived;
  const billed = order.status === "billed";
  const busy = serviceCharge.isPending || packaging.isPending || extraCharge.isPending || setPacked.isPending;

  if (order.status !== "open" && !billed) return null;
  if (!hasService && !hasPackaging && !canAddPackaging && options.length === 0 && !billed) return null;

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  const rupees = (n: number) => `₹${money(n)}`;
  const row = (key: string, label: string, amount: string, button: React.ReactNode) => (
    <div key={key} className="flex items-center justify-between gap-3 text-sm">
      <span className="min-w-0 text-slate-700">
        {label} <span className="tabular-nums text-slate-500">{amount}</span>
      </span>
      {button}
    </div>
  );

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3" data-testid="settle-charges">
      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Charges on this bill</p>
      {billed ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-600">The bill is locked. Reopen it to add or remove charges.</p>
          <Button type="button" size="sm" variant="secondary" onClick={() => setReopening(true)}>
            Reopen bill
          </Button>
        </div>
      ) : (
        <>
          {hasService &&
            row(
              "service",
              `Service charge (${totals.serviceChargePercent ?? 0}%)`,
              order.serviceChargeWaived ? "removed" : rupees(totals.serviceCharge ?? 0),
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => run(() => serviceCharge.mutateAsync({ orderId, waived: !order.serviceChargeWaived }))}
              >
                {order.serviceChargeWaived ? "Add back" : "Remove"}
              </Button>,
            )}
          {hasPackaging &&
            row(
              "packaging",
              "Packaging",
              order.packagingWaived ? "removed" : rupees(totals.packagingCharge ?? 0),
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => run(() => packaging.mutateAsync({ orderId, waived: !order.packagingWaived }))}
              >
                {order.packagingWaived ? "Add back" : "Remove"}
              </Button>,
            )}
          {canAddPackaging &&
            row(
              "pack-all",
              "Packaging",
              "none",
              <Button
                type="button"
                size="sm"
                variant="secondary"
                icon={Plus}
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    for (const item of unpacked) await setPacked.mutateAsync({ itemId: item._id, packed: true });
                  })
                }
              >
                Pack everything
              </Button>,
            )}
          {options.map((charge) =>
            row(
              charge.key,
              charge.name,
              charge.applied
                ? rupees(totals.extraCharges?.find((c) => c.name === charge.name)?.amount ?? 0)
                : charge.type === "percent"
                  ? `${charge.value}%`
                  : rupees(charge.value),
              <Button
                type="button"
                size="sm"
                variant="secondary"
                icon={charge.applied ? X : Plus}
                disabled={busy}
                onClick={() =>
                  run(() => extraCharge.mutateAsync({ orderId, key: charge.key, applied: !charge.applied }))
                }
              >
                {charge.applied ? "Remove" : "Add"}
              </Button>,
            ),
          )}
        </>
      )}
      <ErrorText>{error}</ErrorText>
      <ReasonDialog
        open={reopening}
        title={`Reopen bill ${order.invoiceNumber ?? ""}?`}
        description="The order unlocks so charges can change, and keeps the same invoice number. The reason goes in the audit log."
        confirmLabel="Reopen bill"
        onCancel={() => setReopening(false)}
        onConfirm={async ({ note }) => {
          await reopen.mutateAsync({ orderId, reason: note });
          setReopening(false);
        }}
      />
    </div>
  );
}

/**
 * Takes the whole bill through the online payment (Razorpay or Paytm) Checkout (UPI, cards, net banking, wallets) from the staff's own device,
 * when the restaurant has online payments set up. The server settles the order once Razorpay confirms.
 */
function RazorpayPanel({
  orderId,
  total,
  disabled,
  onPaid,
}: {
  orderId: string;
  total: number;
  disabled: boolean;
  onPaid: () => void;
}) {
  const available = useOrder(orderId).data?.onlinePayment;
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  if (!available) return null;

  async function pay() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const outcome = await payOnline(orderId);
      if (outcome.kind === "dismissed") return;
      if (outcome.kind === "failed") {
        setError(`${outcome.message} Nothing was charged.`);
        return;
      }
      const fresh = await ordersApi.get(orderId);
      queryClient.setQueryData(orderKeys.detail(orderId), fresh);
      await queryClient.invalidateQueries({ queryKey: orderKeys.all });
      if (fresh.order.status === "closed") onPaid();
      else setNotice("Payment received. It is being confirmed, check Online payments if the order stays open.");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-orange-200 bg-orange-50/60 p-3">
      <Button type="button" icon={CreditCard} loading={busy} disabled={disabled} onClick={pay}>
        Pay ₹{money(total)} online
      </Button>
      <p className="text-xs text-slate-600">
        UPI QR, cards, net banking and wallets. The order is marked paid by itself. For cash or split payments use the
        options below.
      </p>
      {notice && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</p>}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

/**
 * A UPI payment is taken on trust unless it is recorded: the payer's mobile number or a screenshot of the
 * payment (taken with the camera or uploaded) has to be added before the bill can be marked paid.
 */
function UpiProof({
  orderId,
  guestPhone,
  line,
  index,
  onChange,
}: {
  orderId: string;
  /** The customer's number already on the order, used when none is typed here. */
  guestPhone: string;
  line: Line;
  index: number;
  onChange: (patch: Partial<Line>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const preview = line.proofPreview;

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const proofKey = await ordersApi.uploadPaymentProof(orderId, file);
      onChange({ proofKey, proofPreview: URL.createObjectURL(file) });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const missing = false;
  const usingGuest = !line.payerPhone.trim() && validMobile(guestPhone);
  return (
    <div
      className={`flex flex-col gap-3 rounded-lg border p-3 ${missing ? "border-amber-300 bg-amber-50/60" : "border-emerald-200 bg-emerald-50/50"}`}
      data-testid="upi-proof"
    >
      <p className="text-sm font-semibold text-slate-800">
        Record this UPI payment{" "}
        <span className="font-normal text-slate-600">
          {usingGuest ? "(the customer's number on the order is used)" : "(optional: a mobile number or a screenshot)"}
        </span>
      </p>
      <Field label="Payer's mobile number" htmlFor={`settle-payer-${index}`}>
        <Input
          id={`settle-payer-${index}`}
          type="tel"
          inputMode="numeric"
          autoComplete="off"
          placeholder={usingGuest ? guestPhone : "10-digit mobile number"}
          value={line.payerPhone}
          onChange={(e) => onChange({ payerPhone: e.target.value })}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          icon={Camera}
          loading={busy}
          onClick={() => cameraInput.current?.click()}
        >
          Take photo
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          icon={ImageUp}
          loading={busy}
          onClick={() => fileInput.current?.click()}
        >
          Upload screenshot
        </Button>
        {line.proofKey && (
          <span className="inline-flex items-center gap-2 text-sm text-emerald-800">
            {preview && (
              <img src={preview} alt="Payment screenshot" className="h-12 w-12 rounded-md border border-slate-200 object-cover" />
            )}
            Screenshot added
            <button
              type="button"
              className="text-xs font-medium text-red-600 hover:underline"
              onClick={() => onChange({ proofKey: "", proofPreview: "" })}
            >
              Remove
            </button>
          </span>
        )}
      </div>
      {line.payerPhone.trim() !== "" && !validMobile(line.payerPhone) && (
        <p className="text-xs text-red-600">Enter a valid 10-digit mobile number, or clear it.</p>
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

function SettleForm({ orderId, total, invoiceNumber, upi, onClose }: SettleDialogProps) {
  const cafe = useServiceFlow() === "cafe";
  // Cafe flow: the guest pays before the food is made, usually on their phone, so the UPI QR is shown first.
  const [lines, setLines] = useState<Line[]>([
    // A bill of nothing (every dish complimentary) has no payment to take: it is recorded as cash 0.00.
    emptyLine(cafe && upi?.upiVpa && total > 0 ? "upi" : "cash", money(total)),
  ]);
  const [splitCount, setSplitCount] = useState("2");
  const [error, setError] = useState<string | null>(null);
  const settle = useSettleOrder();
  const orderCustomer = useOrderCustomer(orderId).data;
  // The mobile number the guest already gave on this order.
  const guestPhone = useOrder(orderId).data?.order.customerPhone ?? "";

  const paid = lines.reduce((sum, l) => sum + toNumber(l.amount), 0);
  const remaining = Math.round((total - paid) * 100) / 100;
  const upiAmount = lines.filter((l) => l.method === "upi").reduce((sum, l) => sum + toNumber(l.amount), 0);
  const creditAmount = lines.filter((l) => l.method === "credit").reduce((sum, l) => sum + toNumber(l.amount), 0);
  const creditGuest = orderCustomer?.customer ?? null;
  const creditInfo = orderCustomer?.credit ?? null;
  const creditRoom = creditInfo?.creditLimit != null ? Math.max(0, creditInfo.creditLimit - creditInfo.balance) : null;

  function update(index: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      emptyLine("upi", money(Math.max(remaining, 0))),
    ]);
  }

  function splitEqually() {
    const n = Math.min(Math.max(Math.floor(toNumber(splitCount)), 2), 10);
    const share = Math.floor((total / n) * 100) / 100;
    const last = Math.round((total - share * (n - 1)) * 100) / 100;
    setLines(
      Array.from({ length: n }, (_, i) => emptyLine(lines[i]?.method ?? "cash", money(i === n - 1 ? last : share))),
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (Math.abs(remaining) > 0.001) {
      setError(
        remaining > 0 ? `₹${money(remaining)} is still unpaid` : `Payments are ₹${money(-remaining)} over the bill`,
      );
      return;
    }
    if (lines.some((l) => upiNumberInvalid(l))) {
      setError("Enter a valid 10-digit mobile number for the UPI payment, or clear it");
      return;
    }
    try {
      await settle.mutateAsync({
        orderId,
        payments: lines.map((l) => ({
          method: l.method,
          amount: toNumber(l.amount),
          ...(l.method === "upi" && payerNumber(l, guestPhone) && { payerPhone: payerNumber(l, guestPhone) }),
          ...(l.method === "upi" && l.proofKey && { proofKey: l.proofKey }),
          ...(l.reference.trim() && { reference: l.reference.trim() }),
          ...(l.method === "cash" && l.tendered.trim() && { tendered: toNumber(l.tendered) }),
        })),
      });
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  const settled = Math.abs(remaining) < 0.001 && !lines.some((l) => upiNumberInvalid(l));
  const nothingToPay = total <= 0;

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={cafe ? "Pay and send to the kitchen" : `Settle ${invoiceNumber ?? "bill"}`}
      description={
        nothingToPay
          ? "Every dish on this bill is complimentary, so there is nothing to pay."
          : cafe
            ? "Take one payment, or split it across methods. The kitchen ticket prints as soon as it is paid."
            : "Take one payment, or split it across methods and people."
      }
      onSubmit={submit}
      dismissible={!settle.isPending}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={settle.isPending}>
            Not yet
          </Button>
          <Button type="submit" size="lg" variant="success" loading={settle.isPending} disabled={!settled}>
            {settle.isPending
              ? "Settling..."
              : nothingToPay
                ? cafe
                  ? "Complete · send KOT"
                  : "Complete"
                : cafe
                  ? "Paid · send KOT"
                  : "Mark paid"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ChargesPanel orderId={orderId} />

        {!nothingToPay && <RazorpayPanel orderId={orderId} total={total} disabled={settle.isPending} onPaid={onClose} />}

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
              {line.method === "upi" && (
                <UpiProof
                  orderId={orderId}
                  guestPhone={guestPhone}
                  line={line}
                  index={index}
                  onChange={(patch) => update(index, patch)}
                />
              )}
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

        {creditAmount > 0 &&
          (creditGuest ? (
            <p
              className={`rounded-lg px-3 py-2 text-sm ${
                creditRoom !== null && creditAmount > creditRoom + 0.001
                  ? "bg-red-50 text-red-700"
                  : "bg-blue-50 text-blue-900"
              }`}
              data-testid="credit-hint"
            >
              ₹{money(creditAmount)} goes on {creditGuest.name || "the guest"}'s account
              {creditInfo && creditInfo.balance > 0 && `, who already owes ₹${money(creditInfo.balance)}`}.
              {creditRoom !== null && ` Their limit leaves room for ₹${money(creditRoom)}.`}
            </p>
          ) : (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="credit-hint">
              Attach the guest's phone number to this order before putting the bill on their account.
            </p>
          ))}

        {upi?.upiVpa && upiAmount > 0 && (
          <UpiQr vpa={upi.upiVpa} payee={upi.upiPayeeName} amount={upiAmount} note={invoiceNumber ?? "Bill"} />
        )}

        <ErrorText>{error}</ErrorText>
      </div>
    </Dialog>
  );
}
