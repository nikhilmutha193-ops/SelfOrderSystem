import { HandCoins, Wallet } from "lucide-react";
import { useState } from "react";

import { useCanEdit } from "../../../lib/adminAuth";
import type { CustomerDue } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { DATE, MONEY, sheet } from "../../../shared/export/excel";
import { Dialog } from "../../../shared/ui/Dialog";
import { ExcelButton } from "../../../shared/ui/ExcelButton";
import { Badge, Button, Card, CardHeader, ErrorText, Field, Input, Select, TableWrap } from "../../../shared/ui/ui";
import type { CreditPaymentInput } from "../api";
import { useCustomerCredit, useDues, useRecordCreditPayment, useSetCreditLimit } from "../queries";

const NO_DUES: CustomerDue[] = [];
const PAYMENT_METHODS: {
  value: CreditPaymentInput["method"];
  label: string;
}[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "online", label: "Online" },
];
const ENTRY_LABELS = {
  charge: "Bill on account",
  payment: "Paid",
  reverse: "Bill voided",
} as const;

function when(iso: string) {
  return new Date(iso).toLocaleDateString([], { dateStyle: "medium" });
}

function formatPhone(phone: string) {
  return phone.length === 12 && phone.startsWith("91") ? `+91 ${phone.slice(2, 7)} ${phone.slice(7)}` : `+${phone}`;
}

function PaymentDialog({
  customerId,
  name,
  due,
  onClose,
}: {
  customerId: string;
  name: string;
  due: number;
  onClose: () => void;
}) {
  const record = useRecordCreditPayment();
  const [amount, setAmount] = useState(due.toFixed(2));
  const [method, setMethod] = useState<CreditPaymentInput["method"]>("cash");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Payment from ${name || "guest"}`}
      description={`₹${due.toFixed(2)} is due. Cash is added to the open shift.`}
      dismissible={!record.isPending}
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await record.mutateAsync({
            id: customerId,
            input: {
              amount: Number(amount),
              method,
              ...(reference.trim() && { reference: reference.trim() }),
              ...(note.trim() && { note: note.trim() }),
            },
          });
          onClose();
        } catch (err) {
          setError(extractErrorMessage(err));
        }
      }}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={record.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="success" loading={record.isPending} disabled={!(Number(amount) > 0)}>
            Record payment
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount (₹)" htmlFor="credit-pay-amount">
          <Input
            id="credit-pay-amount"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Paid by" htmlFor="credit-pay-method">
          <Select
            id="credit-pay-method"
            value={method}
            onChange={(e) => setMethod(e.target.value as CreditPaymentInput["method"])}
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        {method !== "cash" && (
          <Field label="Reference" htmlFor="credit-pay-reference">
            <Input
              id="credit-pay-reference"
              maxLength={60}
              placeholder="UTR / last 4 digits"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>
        )}
        <Field label="Note" htmlFor="credit-pay-note" className={method === "cash" ? "sm:col-span-1" : "sm:col-span-2"}>
          <Input
            id="credit-pay-note"
            maxLength={200}
            placeholder="Optional"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </div>
      <ErrorText>{error}</ErrorText>
    </Dialog>
  );
}

export function CreditSection({ customerId, name }: { customerId: string; name: string }) {
  const credit = useCustomerCredit(customerId);
  const setLimit = useSetCreditLimit();
  const canEditLimit = useCanEdit("customers");
  const canTakePayment = useCanEdit("orders");
  const [limitDraft, setLimitDraft] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const data = credit.data;
  if (!data) return <ErrorText>{credit.error ? extractErrorMessage(credit.error) : null}</ErrorText>;
  const limitValue = limitDraft ?? (data.creditLimit != null ? String(data.creditLimit) : "");

  return (
    <div className="flex flex-col gap-3" data-testid="credit-section">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Pay later account</h3>
          <p className={`text-2xl font-bold tabular-nums ${data.balance > 0 ? "text-red-700" : "text-slate-900"}`}>
            ₹{data.balance.toFixed(2)} <span className="text-sm font-medium text-slate-500">due</span>
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Credit limit (₹)" htmlFor="credit-limit" hint="Empty means no limit">
            <Input
              id="credit-limit"
              className="!w-36"
              type="number"
              inputMode="decimal"
              min={0}
              step="1"
              disabled={!canEditLimit}
              placeholder="No limit"
              value={limitValue}
              onChange={(e) => setLimitDraft(e.target.value)}
            />
          </Field>
          {canEditLimit && limitDraft !== null && (
            <Button
              type="button"
              variant="secondary"
              loading={setLimit.isPending}
              onClick={async () => {
                setError(null);
                try {
                  await setLimit.mutateAsync({
                    id: customerId,
                    creditLimit: limitDraft.trim() === "" ? null : Number(limitDraft),
                  });
                  setLimitDraft(null);
                } catch (err) {
                  setError(extractErrorMessage(err));
                }
              }}
            >
              Save limit
            </Button>
          )}
          {canTakePayment && data.balance > 0 && (
            <Button type="button" icon={HandCoins} onClick={() => setPaying(true)}>
              Record payment
            </Button>
          )}
        </div>
      </div>
      <ErrorText>{error}</ErrorText>
      {data.entries.length > 0 ? (
        <ul className="flex flex-col divide-y divide-slate-100 text-sm">
          {data.entries.map((e) => (
            <li key={e._id} className="flex justify-between gap-2 py-1.5">
              <span className="min-w-0 text-slate-600">
                {when(e.createdAt)} · {ENTRY_LABELS[e.type]}
                {e.invoiceNumber && ` · ${e.invoiceNumber}`}
                {e.method && ` · ${e.method.toUpperCase()}`}
                {e.reference && ` · ${e.reference}`}
                {e.note && e.type === "payment" && <span className="text-slate-400"> · {e.note}</span>}
              </span>
              <span className={`shrink-0 tabular-nums ${e.type === "charge" ? "text-red-600" : "text-green-700"}`}>
                {e.type === "charge" ? "+" : "−"}₹{e.amount.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-400">Nothing on account yet. Choose "Pay later" when settling a bill.</p>
      )}
      {paying && (
        <PaymentDialog customerId={customerId} name={name} due={data.balance} onClose={() => setPaying(false)} />
      )}
    </div>
  );
}

export function DuesCard({ onOpen }: { onOpen: (customerId: string) => void }) {
  const dues = useDues();
  const list = dues.data ?? NO_DUES;
  if (list.length === 0 && !dues.error) return null;
  const total = list.reduce((sum, d) => sum + d.balance, 0);

  return (
    <Card>
      <CardHeader
        icon={Wallet}
        title="Pay later dues"
        description={`${list.length} guest${list.length === 1 ? "" : "s"} owe ₹${total.toFixed(2)} in all.`}
        actions={
          <ExcelButton
            fileName="pay-later-dues"
            size="sm"
            sheets={() => [
              sheet({
                name: "Dues",
                rows: list,
                columns: [
                  {
                    header: "Name",
                    value: (d) => d.name || "Guest",
                    width: 22,
                  },
                  { header: "Phone", value: (d) => `+${d.phone}`, width: 16 },
                  { header: "Due", value: (d) => d.balance, format: MONEY },
                  {
                    header: "Limit",
                    value: (d) => d.creditLimit,
                    format: MONEY,
                  },
                  {
                    header: "Last bill",
                    value: (d) => new Date(d.lastAt),
                    format: DATE,
                  },
                ],
              }),
            ]}
          />
        }
      />
      <ErrorText>{dues.error ? extractErrorMessage(dues.error) : null}</ErrorText>
      <TableWrap>
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr>
              <th>Guest</th>
              <th>Phone</th>
              <th className="text-right">Due</th>
              <th className="text-right">Limit</th>
              <th>Last bill</th>
            </tr>
          </thead>
          <tbody>
            {list.map((d) => (
              <tr
                key={d.customerId}
                data-due={d.name}
                className="cursor-pointer border-t border-slate-100 hover:bg-orange-50"
                onClick={() => onOpen(d.customerId)}
              >
                <td>
                  {d.name || "Guest"}{" "}
                  {d.creditLimit != null && d.balance > d.creditLimit && <Badge tone="red">Over limit</Badge>}
                </td>
                <td className="tabular-nums">{formatPhone(d.phone)}</td>
                <td className="text-right font-semibold text-red-700 tabular-nums">₹{d.balance.toFixed(2)}</td>
                <td className="text-right tabular-nums">
                  {d.creditLimit != null ? `₹${d.creditLimit.toFixed(0)}` : "None"}
                </td>
                <td>{when(d.lastAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </Card>
  );
}
