import { Landmark, Percent, ReceiptText, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { extractErrorMessage } from "../../../shared/api/client";
import { ExcelButton } from "../../../shared/ui/ExcelButton";
import { usePageTour, type TourStep } from "../../../shared/ui/PageTour";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  ErrorText,
  Input,
  Page,
  PageHeader,
  StatCard,
  TableWrap,
} from "../../../shared/ui/ui";
import { gstSheets } from "../gstExcel";
import { useGstReport } from "../queries";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const iso = (d: Date) => d.toLocaleDateString("en-CA");

/** Quick periods. The Indian financial year runs April to March. */
function presets(): { label: string; from: string; to: string }[] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const day = (offset: number) => new Date(y, m, now.getDate() + offset);
  const fyStartYear = m >= 3 ? y : y - 1;
  // Financial-year quarters (Apr-Jun, Jul-Sep, Oct-Dec, Jan-Mar) line up with calendar quarters.
  const quarterStart = new Date(y, Math.floor(m / 3) * 3, 1);
  return [
    { label: "Today", from: iso(now), to: iso(now) },
    { label: "Yesterday", from: iso(day(-1)), to: iso(day(-1)) },
    { label: "Last 7 days", from: iso(day(-6)), to: iso(now) },
    { label: "This month", from: iso(new Date(y, m, 1)), to: iso(now) },
    { label: "Last month", from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) },
    { label: "This quarter", from: iso(quarterStart), to: iso(now) },
    { label: "This financial year", from: iso(new Date(fyStartYear, 3, 1)), to: iso(now) },
  ];
}

const STATUS_TONE = { paid: "green", unpaid: "blue", voided: "red", cancelled: "red" } as const;

export default function Gst() {
  const quick = useMemo(() => presets(), []);
  const [from, setFrom] = useState(quick[3].from);
  const [to, setTo] = useState(quick[3].to);
  const report = useGstReport(from, to);
  const data = report.data;

  const tourSteps: TourStep[] = useMemo(
    () => [
      {
        target: "gst-period",
        title: "Choose the period",
        description: "Pick dates or a quick period such as This month or This financial year.",
      },
      {
        target: "gst-summary",
        title: "GST at a glance",
        description:
          "Taxable value and the GST collected, taken from the tax saved on each bill. Voided and cancelled invoices are left out.",
      },
    ],
    [],
  );
  usePageTour(tourSteps);

  return (
    <Page>
      <PageHeader
        title="GST"
        description="GST collected on the invoices you issued, split by tax, rate, day and invoice. Use it for your return."
        actions={
          <ExcelButton
            fileName={`gst-${from}-to-${to}`}
            disabled={!data || data.summary.invoices === 0}
            sheets={() => (data ? gstSheets(data) : [])}
          />
        }
      />

      <Card data-tour="gst-period">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-slate-700">
            From
            <Input
              className="mt-1"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            To
            <Input
              className="mt-1"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {quick.map((p) => {
            const active = p.from === from && p.to === to;
            return (
              <button
                key={p.label}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setFrom(p.from);
                  setTo(p.to);
                }}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  active
                    ? "border-orange-600 bg-orange-600 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </Card>

      <ErrorText>{report.error ? extractErrorMessage(report.error) : null}</ErrorText>
      {report.isLoading && <p className="text-sm text-slate-500">Working out the GST…</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-tour="gst-summary">
            <StatCard label="Taxable value" value={rupees(data.summary.taxableValue)} icon={Wallet} tone="blue" />
            <StatCard
              label="Total GST"
              value={rupees(data.summary.gst)}
              icon={Percent}
              tone="orange"
              hint={data.gstin ? `GSTIN ${data.gstin}` : "No GSTIN set in settings"}
            />
            <StatCard label="Invoice value" value={rupees(data.summary.invoiceValue)} icon={Landmark} tone="green" />
            <StatCard label="Invoices" value={data.summary.invoices} icon={ReceiptText} tone="violet" />
          </div>

          {(data.excluded.voided.count > 0 || data.excluded.cancelled.count > 0) && (
            <Alert tone="info">
              Not counted above:{" "}
              {[
                data.excluded.voided.count > 0 &&
                  `${data.excluded.voided.count} voided (${rupees(data.excluded.voided.value)})`,
                data.excluded.cancelled.count > 0 &&
                  `${data.excluded.cancelled.count} cancelled (${rupees(data.excluded.cancelled.value)})`,
              ]
                .filter(Boolean)
                .join(" and ")}
              . Their invoice numbers are still in the list below.
            </Alert>
          )}

          {data.refunds && data.refunds.count > 0 && (
            <Alert tone="warning">
              {data.refunds.count} refund{data.refunds.count === 1 ? "" : "s"} worth {rupees(data.refunds.amount)} were
              given in this period. They are not taken off the totals above. Raise credit notes for them in your GST
              return.
            </Alert>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="GST by tax" description="Each tax line on the bills." />
              {data.byComponent.length === 0 ? (
                <p className="text-sm text-slate-400">No GST in this period.</p>
              ) : (
                <TableWrap>
                  <table className="w-full min-w-[22rem] text-sm">
                    <thead>
                      <tr>
                        <th>Tax</th>
                        <th className="text-right">Rate</th>
                        <th className="text-right">Taxable value</th>
                        <th className="text-right">Tax</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byComponent.map((c) => (
                        <tr key={`${c.name}-${c.percent}`} className="border-t border-slate-100">
                          <td className="font-medium">{c.name}</td>
                          <td className="text-right tabular-nums">{c.percent}%</td>
                          <td className="text-right tabular-nums">{rupees(c.taxableValue)}</td>
                          <td className="text-right font-semibold tabular-nums">{rupees(c.amount)}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-slate-200 font-bold">
                        <td colSpan={3}>Total GST</td>
                        <td className="text-right tabular-nums">{rupees(data.summary.gst)}</td>
                      </tr>
                    </tbody>
                  </table>
                </TableWrap>
              )}
            </Card>

            <Card>
              <CardHeader
                title="By GST rate and customer type"
                description="Total rate per bill, and B2B against B2C."
              />
              <TableWrap>
                <table className="w-full min-w-[22rem] text-sm">
                  <thead>
                    <tr>
                      <th>Group</th>
                      <th className="text-right">Invoices</th>
                      <th className="text-right">Taxable value</th>
                      <th className="text-right">GST</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bySlab.map((s) => (
                      <tr key={s.rate} className="border-t border-slate-100">
                        <td className="font-medium">GST {s.rate}%</td>
                        <td className="text-right tabular-nums">{s.invoices}</td>
                        <td className="text-right tabular-nums">{rupees(s.taxableValue)}</td>
                        <td className="text-right tabular-nums">{rupees(s.gst)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-200">
                      <td className="font-medium">B2B (customer GSTIN)</td>
                      <td className="text-right tabular-nums">{data.b2b.invoices}</td>
                      <td className="text-right tabular-nums">{rupees(data.b2b.taxableValue)}</td>
                      <td className="text-right tabular-nums">{rupees(data.b2b.gst)}</td>
                    </tr>
                    <tr className="border-t border-slate-100">
                      <td className="font-medium">B2C</td>
                      <td className="text-right tabular-nums">{data.b2c.invoices}</td>
                      <td className="text-right tabular-nums">{rupees(data.b2c.taxableValue)}</td>
                      <td className="text-right tabular-nums">{rupees(data.b2c.gst)}</td>
                    </tr>
                  </tbody>
                </table>
              </TableWrap>
            </Card>
          </div>

          <Card>
            <CardHeader title="Sales build-up" description="How the invoice value is made up for the whole period." />
            <dl className="grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
              {(
                [
                  ["Gross sales", data.summary.grossSales],
                  ["Discounts", -data.summary.discounts],
                  ["Service charge", data.summary.serviceCharge],
                  ["Packaging", data.summary.packaging],
                  ["Taxable value", data.summary.taxableValue],
                  ["GST", data.summary.gst],
                  ["Round off", data.summary.roundOff],
                  ["Invoice value", data.summary.invoiceValue],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex justify-between border-b border-slate-100 py-1 tabular-nums">
                  <dt className="text-slate-600">{label}</dt>
                  <dd className="font-medium text-slate-900">{rupees(value)}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <CardHeader title="By day" />
            {data.byDay.length === 0 ? (
              <p className="text-sm text-slate-400">No invoices in this period.</p>
            ) : (
              <TableWrap>
                <table className="w-full min-w-[26rem] text-sm">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th className="text-right">Invoices</th>
                      <th className="text-right">Taxable value</th>
                      <th className="text-right">GST</th>
                      <th className="text-right">Invoice value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byDay.map((d) => (
                      <tr key={d.date} className="border-t border-slate-100">
                        <td className="tabular-nums">{d.date}</td>
                        <td className="text-right tabular-nums">{d.invoices}</td>
                        <td className="text-right tabular-nums">{rupees(d.taxableValue)}</td>
                        <td className="text-right tabular-nums">{rupees(d.gst)}</td>
                        <td className="text-right tabular-nums">{rupees(d.invoiceValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Invoices"
              description={`${data.invoices.length} in this period, including voided and cancelled.`}
            />
            <TableWrap>
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th className="text-right">Taxable value</th>
                    <th className="text-right">GST</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.invoices.map((r) => (
                    <tr key={r.orderId} className="border-t border-slate-100 align-top">
                      <td>
                        <Link className="font-medium text-orange-700 hover:underline" to={`/admin/orders/${r.orderId}`}>
                          {r.invoiceNumber ?? "Legacy bill"}
                        </Link>
                        <span className="block text-xs text-slate-500">
                          {r.billedAt ? new Date(r.billedAt).toLocaleString() : "-"}
                        </span>
                      </td>
                      <td>
                        {r.customerName}
                        {r.customerGstin && (
                          <span className="block text-xs text-slate-500">GSTIN {r.customerGstin}</span>
                        )}
                      </td>
                      <td>
                        <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                      </td>
                      <td className="text-right tabular-nums">{rupees(r.taxableValue)}</td>
                      <td className="text-right tabular-nums">
                        {rupees(r.gst)}
                        <span className="block text-xs text-slate-500">
                          {r.taxLines.map((t) => `${t.name} ${t.amount.toFixed(2)}`).join(" · ")}
                        </span>
                      </td>
                      <td className="text-right tabular-nums">{rupees(r.grandTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        </>
      )}
    </Page>
  );
}
