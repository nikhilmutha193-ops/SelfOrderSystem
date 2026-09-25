import { useEffect, useState } from "react";

import { Card, ErrorText, TableWrap } from "../../components/ui";
import { api, extractErrorMessage } from "../../lib/apiClient";

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
  color = "#ea580c",
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
            className="w-full rounded-t"
            style={{ height: `${(d.value / max) * 120}px`, minHeight: d.value > 0 ? 2 : 0, background: color }}
          />
          <span className="whitespace-nowrap text-[9px] text-slate-400">{d.label}</span>
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Analytics</h1>
        <label className="text-sm font-medium text-slate-700">
          Period{" "}
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="ml-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </label>
      </div>

      <ErrorText>{error}</ErrorText>

      {sales && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <Card>
              <p className="text-xs uppercase tracking-wide text-slate-500">Revenue ({sales.days}d)</p>
              <p className="mt-1 text-2xl font-bold text-slate-800">{rupee(sales.totalRevenue)}</p>
            </Card>
            <Card>
              <p className="text-xs uppercase tracking-wide text-slate-500">Orders ({sales.days}d)</p>
              <p className="mt-1 text-2xl font-bold text-slate-800">{sales.totalOrders}</p>
            </Card>
            <Card>
              <p className="text-xs uppercase tracking-wide text-slate-500">Avg order value</p>
              <p className="mt-1 text-2xl font-bold text-slate-800">
                {rupee(sales.totalOrders ? sales.totalRevenue / sales.totalOrders : 0)}
              </p>
            </Card>
          </div>

          <Card>
            <h2 className="mb-3 text-lg font-semibold text-slate-800">Revenue by day</h2>
            <BarChart
              data={sales.byDay.map((d) => ({ label: d.date.slice(5), value: d.revenue }))}
              valueFormat={rupee}
            />
          </Card>

          <Card>
            <h2 className="mb-1 text-lg font-semibold text-slate-800">Orders by hour (peak times)</h2>
            <p className="mb-3 text-xs text-slate-500">When orders come in, across the period.</p>
            <BarChart data={sales.byHour.map((h) => ({ label: String(h.hour), value: h.orders }))} color="#2563eb" />
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="mb-3 text-lg font-semibold text-slate-800">Order type mix</h2>
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
              <h2 className="mb-3 text-lg font-semibold text-slate-800">Top dishes</h2>
              {sales.topDishes.length === 0 ? (
                <p className="text-sm text-slate-400">No data yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="pb-1">Dish</th>
                      <th className="pb-1 text-right">Qty</th>
                      <th className="pb-1 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.topDishes.map((d) => (
                      <tr key={d.name} className="border-t border-slate-100">
                        <td className="py-1.5">{d.name}</td>
                        <td className="py-1.5 text-right tabular-nums">{d.qty}</td>
                        <td className="py-1.5 text-right tabular-nums">{rupee(d.revenue)}</td>
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
        <h2 className="mb-1 text-lg font-semibold text-slate-800">Preparation time — actual vs estimated</h2>
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
                <tr className="text-left text-slate-500">
                  <th className="pb-2">Dish</th>
                  <th className="pb-2 text-right">Estimate</th>
                  <th className="pb-2 text-right">Actual avg</th>
                  <th className="pb-2 text-right">Difference</th>
                  <th className="pb-2 text-right">Samples</th>
                </tr>
              </thead>
              <tbody>
                {prep.rows.map((r) => (
                  <tr key={r.name} className="border-t border-slate-100">
                    <td className="py-1.5">{r.name}</td>
                    <td className="py-1.5 text-right tabular-nums">{r.estimate}m</td>
                    <td className="py-1.5 text-right tabular-nums">{r.actualAvg}m</td>
                    <td
                      className={`py-1.5 text-right tabular-nums font-medium ${r.diff > 0 ? "text-red-600" : "text-green-600"}`}
                    >
                      {r.diff > 0 ? "+" : ""}
                      {r.diff}m
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-slate-400">{r.samples}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
