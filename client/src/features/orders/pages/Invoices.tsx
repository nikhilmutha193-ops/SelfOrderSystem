import { useState } from "react";
import { Link } from "react-router-dom";

import { extractErrorMessage } from "../../../shared/api/client";
import { Badge, Card, ErrorText, Input, TableWrap } from "../../../shared/ui/ui";
import { useInvoiceRegister } from "../queries";
import { INVOICE_STATUS_BADGE, orderTypeLabel } from "../status";

function today(): string {
  return new Date().toLocaleDateString("en-CA");
}

export default function Invoices() {
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const register = useInvoiceRegister({ from: from || undefined, to: to || undefined });
  const rows = register.data ?? [];
  const paidTotal = rows.filter((r) => r.status === "paid").reduce((sum, r) => sum + (r.grandTotal ?? 0), 0);
  const numbers = rows.map((r) => r.invoiceNumber);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Invoice register</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every bill number issued, including cancelled and voided bills. Numbers are never reused.
        </p>
      </div>

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
              <tr className="text-left text-slate-500">
                <th className="pb-2">Invoice</th>
                <th className="pb-2">Billed</th>
                <th className="pb-2">Customer</th>
                <th className="pb-2">Type</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Payment</th>
                <th className="pb-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.invoiceNumber} className="border-t border-slate-100 align-top">
                  <td className="py-1.5 font-medium tabular-nums">
                    <Link className="text-orange-600 hover:underline" to={`/admin/orders/${row.orderId}`}>
                      {row.invoiceNumber}
                    </Link>
                  </td>
                  <td className="py-1.5 text-slate-600">
                    {row.billedAt ? new Date(row.billedAt).toLocaleString() : "-"}
                  </td>
                  <td className="py-1.5">
                    {row.customerName}
                    {row.customerGstin && (
                      <span className="block text-xs text-slate-500">GSTIN {row.customerGstin}</span>
                    )}
                  </td>
                  <td className="py-1.5">{orderTypeLabel(row)}</td>
                  <td className="py-1.5">
                    <Badge tone={INVOICE_STATUS_BADGE[row.status].tone}>{INVOICE_STATUS_BADGE[row.status].label}</Badge>
                    {row.reason && (
                      <span className="mt-0.5 block max-w-[14rem] text-xs text-slate-500">{row.reason}</span>
                    )}
                  </td>
                  <td className="py-1.5 capitalize">{row.status === "paid" ? row.paymentMethod : "-"}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {row.grandTotal != null ? `₹${row.grandTotal.toFixed(2)}` : "-"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !register.isLoading && (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-slate-400">
                    No bills in this date range
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
