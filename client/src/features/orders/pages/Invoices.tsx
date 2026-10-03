import { useState } from "react";
import { Link } from "react-router-dom";

import type { InvoiceRegisterRow } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { DATE_TIME, MONEY, sheet, type ExcelColumn } from "../../../shared/export/excel";
import { ExcelButton } from "../../../shared/ui/ExcelButton";
import { Badge, Card, ErrorText, Input, PageHeader, TableWrap } from "../../../shared/ui/ui";
import { useInvoiceRegister } from "../queries";
import { INVOICE_STATUS_BADGE, orderTypeLabel } from "../status";

function registerSheet(rows: InvoiceRegisterRow[]) {
  const taxNames = [...new Set(rows.flatMap((r) => (r.taxLines ?? []).map((t) => t.name)))];
  const columns: ExcelColumn<InvoiceRegisterRow>[] = [
    {
      header: "Invoice",
      value: (r) => r.invoiceNumber ?? "Legacy bill",
      width: 22,
    },
    {
      header: "Billed",
      value: (r) => (r.billedAt ? new Date(r.billedAt) : null),
      format: DATE_TIME,
      width: 18,
    },
    { header: "Customer", value: (r) => r.customerName, width: 22 },
    { header: "GSTIN", value: (r) => r.customerGstin, width: 18 },
    { header: "Type", value: (r) => orderTypeLabel(r) },
    { header: "Status", value: (r) => INVOICE_STATUS_BADGE[r.status].label },
    {
      header: "Payment",
      value: (r) => (r.status === "paid" ? r.paymentMethod : ""),
    },
    {
      header: "Taxable value",
      value: (r) => r.taxableAmount ?? null,
      format: MONEY,
      width: 14,
    },
    ...taxNames.map((name): ExcelColumn<InvoiceRegisterRow> => ({
      header: name,
      value: (r) => r.taxLines?.find((t) => t.name === name)?.amount ?? null,
      format: MONEY,
    })),
    { header: "Total", value: (r) => r.grandTotal, format: MONEY, width: 12 },
    { header: "Reason", value: (r) => r.reason, width: 30 },
  ];
  return [sheet({ name: "Invoices", columns, rows })];
}

function today(): string {
  return new Date().toLocaleDateString("en-CA");
}

export default function Invoices() {
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [number, setNumber] = useState("");
  const [amount, setAmount] = useState("");
  const register = useInvoiceRegister({
    from: from || undefined,
    to: to || undefined,
    number: number.trim() || undefined,
    amount: amount.trim() || undefined,
  });
  const rows = register.data ?? [];
  const paidTotal = rows.filter((r) => r.status === "paid").reduce((sum, r) => sum + (r.grandTotal ?? 0), 0);
  const numbers = rows.map((r) => r.invoiceNumber).filter((n): n is string => !!n);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 sm:gap-6">
      <PageHeader
        title="Invoice register"
        description={<>Every bill number issued, including cancelled and voided bills. Numbers are never reused.</>}
        actions={
          <ExcelButton
            fileName={`invoices-${from || "start"}-to-${to || "today"}`}
            disabled={rows.length === 0}
            sheets={() => registerSheet(rows)}
          />
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-slate-700">
            From
            <Input
              id="invoices-from"
              className="mt-1"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            To
            <Input id="invoices-to" className="mt-1" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Invoice number
            <Input
              id="invoices-number"
              className="mt-1"
              placeholder="e.g. 000123"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Exact amount (₹)
            <Input
              id="invoices-amount"
              className="mt-1 !w-32"
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <div className="ml-auto text-right text-sm text-slate-600">
            <p>
              {rows.length} bill{rows.length === 1 ? "" : "s"}
              {numbers.length > 0 && ` · ${numbers[0]} to ${numbers[numbers.length - 1]}`}
            </p>
            <p className="font-semibold text-slate-800">Paid ₹{paidTotal.toFixed(2)}</p>
          </div>
        </div>
      </Card>

      <ErrorText>{register.error ? extractErrorMessage(register.error) : null}</ErrorText>

      <Card>
        <TableWrap>
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Billed</th>
                <th>Customer</th>
                <th>Type</th>
                <th>Status</th>
                <th>Payment</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.orderId} className="border-t border-slate-100 align-top">
                  <td className="font-medium tabular-nums">
                    <Link
                      className="rounded-md px-2 py-1 text-sm font-medium transition-colors text-orange-700 hover:bg-orange-50"
                      to={`/admin/orders/${row.orderId}`}
                    >
                      {row.invoiceNumber ?? "Legacy bill"}
                    </Link>
                    {row.legacy && (
                      <span className="block text-xs font-normal text-slate-500">Paid before numbering</span>
                    )}
                  </td>
                  <td className="text-slate-600">{row.billedAt ? new Date(row.billedAt).toLocaleString() : "-"}</td>
                  <td>
                    {row.customerName}
                    {row.customerGstin && (
                      <span className="block text-xs text-slate-500">GSTIN {row.customerGstin}</span>
                    )}
                  </td>
                  <td>{orderTypeLabel(row)}</td>
                  <td>
                    <Badge tone={INVOICE_STATUS_BADGE[row.status].tone}>{INVOICE_STATUS_BADGE[row.status].label}</Badge>
                    {row.reason && (
                      <span className="mt-0.5 block max-w-[14rem] text-xs text-slate-500">{row.reason}</span>
                    )}
                  </td>
                  <td className="capitalize">{row.status === "paid" ? row.paymentMethod : "-"}</td>
                  <td className="text-right tabular-nums">
                    {row.grandTotal != null ? `₹${row.grandTotal.toFixed(2)}` : "-"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !register.isLoading && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                    No bills match these filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </div>
  );
}
