import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useCanEdit } from "../../../lib/adminAuth";
import { TENDER_LABELS, type NamedAmount, type TenderMethod } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { ExcelButton } from "../../../shared/ui/ExcelButton";
import { usePageTour, type TourStep } from "../../../shared/ui/PageTour";
import { Badge, Button, Card, ErrorText, Input, TableWrap } from "../../../shared/ui/ui";
import { dayReportSheets } from "../dayReportExcel";
import { useCloseDay, useDayHistory, useDayReport } from "../queries";

const rupees = (n: number | null | undefined) => `₹${(n ?? 0).toFixed(2)}`;

const TYPE_LABELS: Record<string, string> = {
  "dine-in": "Dine-in",
  takeaway: "Take away",
  delivery: "Delivery",
};

function Breakdown({ title, rows, label }: { title: string; rows: NamedAmount[]; label?: (name: string) => string }) {
  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold text-slate-900">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">Nothing yet</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {rows.map((r) => (
            <li key={r.name} className="flex justify-between gap-3">
              <span className="text-slate-700">
                {label ? label(r.name) : r.name}
                <span className="text-slate-400"> · {r.count}</span>
              </span>
              <span className="tabular-nums">{rupees(r.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function DayClose() {
  const canEdit = useCanEdit("dayClose");
  const [date, setDate] = useState("");
  const [carryForward, setCarryForward] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const report = useDayReport(date || undefined);
  const history = useDayHistory();
  const closeDay = useCloseDay();
  const r = report.data;

  async function close() {
    if (!r) return;
    setError(null);
    try {
      await closeDay.mutateAsync({ date: r.businessDate, carryForward });
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  const tourSteps: TourStep[] = useMemo(
    () => [
      {
        target: "day-close-date",
        title: "Pick a business day",
        description: "Defaults to today. Business days follow your day-end time, not midnight.",
      },
      {
        target: "day-close-summary",
        title: "Day summary",
        description: "Bills, sales, discounts, service charge, tax and round-off for the day.",
      },
      ...(report.data && !report.data.closed
        ? [
            {
              target: "day-close-action",
              title: "Close the day",
              description:
                "Closing locks the day's bills to everyone but the owner. If anything's still unpaid, you can carry it into the next day and close anyway.",
            },
          ]
        : []),
      {
        target: "day-close-history",
        title: "Closed days",
        description: "Click a past day to see its report again.",
      },
    ],
    [report.data]
  );
  usePageTour(tourSteps);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Day close</h1>
          <p className="mt-1 text-sm text-slate-500">
            Check the day's takings, then close it. A closed day's bills can only be changed by the owner.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {r && <ExcelButton fileName={`day-close-${r.businessDate}`} sheets={() => dayReportSheets(r)} />}
          <label className="text-sm font-medium text-slate-700">
            Business day
            <Input
              id="day-close-date"
              data-tour="day-close-date"
              className="mt-1"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        </div>
      </div>

      <ErrorText>{error ?? (report.error ? extractErrorMessage(report.error) : null)}</ErrorText>

      {r && (
        <>
          <Card data-tour="day-close-summary">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">{r.businessDate}</h2>
                <p className="text-sm text-slate-500">
                  {r.invoiceRange.count > 0
                    ? `${r.invoiceRange.count} bill number(s): ${r.invoiceRange.first} to ${r.invoiceRange.last}`
                    : "No bills generated"}
                </p>
              </div>
              {r.closed ? (
                <Badge tone="green">
                  Closed {new Date(r.closed.closedAt).toLocaleString()}
                  {r.closed.closedByName ? ` by ${r.closed.closedByName}` : ""}
                </Badge>
              ) : (
                <Badge tone="amber">Open</Badge>
              )}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {[
                ["Paid bills", String(r.totals.bills)],
                ["Items sold", rupees(r.totals.gross)],
                ["Discounts", rupees(r.totals.discounts)],
                ["Service charge", rupees(r.totals.serviceCharge)],
                ["Packaging", rupees(r.totals.packagingCharge ?? 0)],
                ["Taxable value", rupees(r.totals.taxable)],
                ["Tax", rupees(r.totals.tax)],
                ["Round off", rupees(r.totals.roundOff)],
                ["Net sales", rupees(r.totals.net)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="text-base font-semibold tabular-nums text-slate-900">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            <Breakdown
              title="By payment"
              rows={r.byPaymentMethod}
              label={(name) => TENDER_LABELS[name as TenderMethod] ?? name}
            />
            <Breakdown title="By order type" rows={r.byOrderType} label={(name) => TYPE_LABELS[name] ?? name} />
            <Breakdown title="By category" rows={r.byCategory} />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <h3 className="mb-3 text-sm font-semibold text-slate-900">Tax</h3>
              {r.taxes.length === 0 && <p className="text-sm text-slate-400">Nothing yet</p>}
              {r.taxes.map((t) => (
                <p key={`${t.name}${t.percent}`} className="flex justify-between text-sm">
                  <span>
                    {t.name} ({t.percent}%)
                  </span>
                  <span className="tabular-nums">{rupees(t.amount)}</span>
                </p>
              ))}
            </Card>
            <Card>
              <h3 className="mb-3 text-sm font-semibold text-slate-900">Voids and cancellations</h3>
              <p className="flex justify-between text-sm">
                <span>Voided bills · {r.voids.count}</span>
                <span className="tabular-nums">{rupees(r.voids.amount)}</span>
              </p>
              <p className="flex justify-between text-sm">
                <span>Cancelled bills · {r.cancelledBills.count}</span>
                <span className="tabular-nums">{rupees(r.cancelledBills.amount)}</span>
              </p>
              <p className="flex justify-between text-sm">
                <span>Complimentary items · {r.complimentary.count}</span>
                <span className="tabular-nums">{rupees(r.complimentary.value)}</span>
              </p>
            </Card>
            <Card>
              <h3 className="mb-3 text-sm font-semibold text-slate-900">Cash shifts</h3>
              {r.shifts.length === 0 ? (
                <p className="text-sm text-slate-400">No shifts this day</p>
              ) : (
                r.shifts.map((s) => (
                  <p key={s.openedAt} className="flex justify-between text-sm">
                    <span>
                      {new Date(s.openedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span
                      className={`tabular-nums ${(s.variance ?? 0) < 0 ? "text-red-600" : (s.variance ?? 0) > 0 ? "text-amber-700" : ""}`}
                    >
                      {s.variance === null ? "Still open" : `Difference ${rupees(s.variance)}`}
                    </span>
                  </p>
                ))
              )}
            </Card>
          </div>

          {!r.closed && (
            <Card data-tour="day-close-action">
              {r.unsettled.length > 0 && (
                <div className="mb-4">
                  <h3 className="mb-2 text-sm font-semibold text-red-700">
                    {r.unsettled.length} unpaid order
                    {r.unsettled.length === 1 ? "" : "s"}
                  </h3>
                  <ul className="flex flex-col gap-1 text-sm">
                    {r.unsettled.map((u) => (
                      <li key={u.orderId} className="flex justify-between gap-3">
                        <Link
                          className="rounded-md px-2 py-1 text-sm font-medium transition-colors text-orange-700 hover:bg-orange-50"
                          to={`/admin/orders/${u.orderId}`}
                        >
                          {u.invoiceNumber ?? u.customerName}
                        </Link>
                        <span className="text-slate-500">
                          {u.status === "billed" ? "Billed, unpaid" : "Open"}
                          {u.amount !== null && ` · ${rupees(u.amount)}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                    <input
                      id="carry-forward"
                      type="checkbox"
                      className="h-4 w-4 accent-orange-600"
                      checked={carryForward}
                      onChange={(e) => setCarryForward(e.target.checked)}
                    />
                    Carry these into the next day and close anyway
                  </label>
                </div>
              )}
              {canEdit ? (
                <Button onClick={close} disabled={closeDay.isPending || (r.unsettled.length > 0 && !carryForward)}>
                  {closeDay.isPending ? "Closing..." : `Close ${r.businessDate}`}
                </Button>
              ) : (
                <p className="text-sm text-slate-500">You can view this report but not close the day.</p>
              )}
            </Card>
          )}
        </>
      )}

      <Card data-tour="day-close-history">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Closed days</h2>
        <TableWrap>
          <table className="w-full min-w-[30rem] text-sm">
            <thead>
              <tr>
                <th>Day</th>
                <th>Closed</th>
                <th>By</th>
                <th className="text-right">Carried forward</th>
              </tr>
            </thead>
            <tbody>
              {(history.data ?? []).map((d) => (
                <tr key={d._id} className="border-t border-slate-100">
                  <td>
                    <button
                      type="button"
                      className="rounded-md px-2 py-1 text-sm font-medium transition-colors text-orange-700 hover:bg-orange-50"
                      onClick={() => setDate(d.businessDate)}
                    >
                      {d.businessDate}
                    </button>
                  </td>
                  <td>{new Date(d.closedAt).toLocaleString()}</td>
                  <td>{d.closedByName ?? "-"}</td>
                  <td className="text-right tabular-nums">{d.carriedForward.length}</td>
                </tr>
              ))}
              {(history.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-sm text-slate-500">
                    No days closed yet
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
