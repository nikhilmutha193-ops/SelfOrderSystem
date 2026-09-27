import { ClipboardList, IndianRupee, ReceiptText } from "lucide-react";
import { useEffect, useState } from "react";

import { api, extractErrorMessage } from "../../shared/api/client";
import { Card, ErrorText, Page, PageHeader, Skeleton, StatCard, TableWrap, Tabs } from "../../shared/ui/ui";

interface SalesData {
  days: number;
  totalRevenue: number;
  totalOrders: number;
  byDay: { date: string; revenue: number; orders: number }[];
  byHour: { hour: number; revenue: number; orders: number }[];
  byType: { type: string; revenue: number; orders: number }[];
  topDishes: { name: string; qty: number; revenue: number }[];
}

interface PrepData {
  rows: { name: string; estimate: number; actualAvg: number; samples: number; diff: number }[];
}

const rupee = (n: number) => `₹${n.toFixed(2)}`;
const typeLabel = (t: string) =>
  t === "dine-in" ? "Dine-in" : t === "takeaway" ? "Take away" : t === "delivery" ? "Delivery" : t;

function BarChart({
  data,
  color = "var(--color-orange-500)",
  valueFormat,
}: {
  data: { label: string; value: number }[];
  color?: string;
  valueFormat?: (n: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-1 overflow-x-auto" style={{ height: 160 }}>
      {data.map((d, i) => (
        <div
          key={i}
          className="flex min-w-[24px] flex-1 flex-col items-center justify-end gap-1"
          title={`${d.label}: ${valueFormat ? valueFormat(d.value) : d.value}`}
        >
          <div
            className="w-full rounded-t-md transition-opacity hover:opacity-80"
            style={{ height: `${(d.value / max) * 120}px`, minHeight: d.value > 0 ? 2 : 0, background: color }}
          />
          <span className="whitespace-nowrap text-[10px] text-slate-400 tabular-nums">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function Analytics() {
  const [days, setDays] = useState(14);
  const [sales, setSales] = useState<SalesData | null>(null);
  const [prep, setPrep] = useState<PrepData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    Promise.all([
      api.get<SalesData>("/analytics/sales", { params: { days } }),
      api.get<PrepData>("/analytics/prep-times"),
    ])
      .then(([s, p]) => {
        setSales(s.data);
        setPrep(p.data);
      })
      .catch((err) => setError(extractErrorMessage(err)));
  }, [days]);

  return (
    <Page>
      <PageHeader
        title="Analytics"
        description="Sales, peak hours and kitchen speed for the period you pick."
        actions={
          <Tabs
            value={String(days)}
            onChange={(v) => setDays(Number(v))}
            items={[
              { value: "7", label: "7 days" },
              { value: "14", label: "14 days" },
              { value: "30", label: "30 days" },
              { value: "90", label: "90 days" },
            ]}
          />
        }
      />

      <ErrorText>{error}</ErrorText>

      {!sales && !error && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-xl" />
          ))}
        </div>
      )}

      {sales && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
            <StatCard
              label={`Revenue (${sales.days}d)`}
              value={rupee(sales.totalRevenue)}
              icon={IndianRupee}
              tone="green"
            />
            <StatCard label={`Orders (${sales.days}d)`} value={sales.totalOrders} icon={ClipboardList} tone="orange" />
            <StatCard
              label="Avg order value"
              value={rupee(sales.totalOrders ? sales.totalRevenue / sales.totalOrders : 0)}
              icon={ReceiptText}
              tone="blue"
            />
          </div>

          <Card>
            <h2 className="mb-4 text-base font-semibold text-slate-900">Revenue by day</h2>
            <BarChart
              data={sales.byDay.map((d) => ({ label: d.date.slice(5), value: d.revenue }))}
              valueFormat={rupee}
            />
          </Card>

          <Card>
            <h2 className="mb-1 text-base font-semibold text-slate-900">Orders by hour (peak times)</h2>
            <p className="mb-3 text-xs text-slate-500">When orders come in, across the period.</p>
            <BarChart
              data={sales.byHour.map((h) => ({ label: String(h.hour), value: h.orders }))}
              color="var(--color-sky-500)"
            />
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="mb-4 text-base font-semibold text-slate-900">Order type mix</h2>
              {sales.byType.length === 0 ? (
                <p className="text-sm text-slate-400">No data yet.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {sales.byType.map((t) => {
                    const pct = sales.totalOrders ? Math.round((t.orders / sales.totalOrders) * 100) : 0;
                    return (
                      <div key={t.type}>
                        <div className="mb-0.5 flex justify-between text-sm">
                          <span className="text-slate-700">{typeLabel(t.type)}</span>
                          <span className="text-slate-500">
                            {t.orders} · {rupee(t.revenue)} ({pct}%)
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-slate-100">
                          <div className="h-2 rounded-full bg-orange-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card>
              <h2 className="mb-4 text-base font-semibold text-slate-900">Top dishes</h2>
              {sales.topDishes.length === 0 ? (
                <p className="text-sm text-slate-400">No data yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th>Dish</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.topDishes.map((d) => (
                      <tr key={d.name} className="border-t border-slate-100">
                        <td>{d.name}</td>
                        <td className="text-right tabular-nums">{d.qty}</td>
                        <td className="text-right tabular-nums">{rupee(d.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        </>
      )}

      <Card>
        <h2 className="mb-1 text-base font-semibold text-slate-900">Preparation time — actual vs estimated</h2>
        <p className="mb-3 text-xs text-slate-500">
          Actual is measured from KOT print to "ready". Use it to tune each dish's prep time under Food Items.
        </p>
        {!prep || prep.rows.length === 0 ? (
          <p className="text-sm text-slate-400">
            No measured prep times yet — they appear once items are marked ready in the kitchen.
          </p>
        ) : (
          <TableWrap>
            <table className="w-full min-w-[30rem] text-sm">
              <thead>
                <tr>
                  <th>Dish</th>
                  <th className="text-right">Estimate</th>
                  <th className="text-right">Actual avg</th>
                  <th className="text-right">Difference</th>
                  <th className="text-right">Samples</th>
                </tr>
              </thead>
              <tbody>
                {prep.rows.map((r) => (
                  <tr key={r.name} className="border-t border-slate-100">
                    <td>{r.name}</td>
                    <td className="text-right tabular-nums">{r.estimate}m</td>
                    <td className="text-right tabular-nums">{r.actualAvg}m</td>
                    <td
                      className={`py-1.5 text-right tabular-nums font-medium ${r.diff > 0 ? "text-red-600" : "text-green-600"}`}
                    >
                      {r.diff > 0 ? "+" : ""}
                      {r.diff}m
                    </td>
                    <td className="text-right tabular-nums text-slate-400">{r.samples}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </Page>
  );
}
