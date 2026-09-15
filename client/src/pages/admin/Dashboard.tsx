import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, extractErrorMessage } from "../../lib/apiClient";
import { Card, ErrorText, TableWrap } from "../../components/ui";
import type { DashboardSummary, Order } from "../../lib/types";

export default function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [todayOrders, setTodayOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<DashboardSummary>("/dashboard/summary"),
      api.get<Order[]>("/orders", { params: { today: "true", status: "open" } }),
    ])
      .then(([s, o]) => {
        setSummary(s.data);
        setTodayOrders(o.data);
      })
      .catch((err) => setError(extractErrorMessage(err)));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
      {summary && (
        <p className="-mt-4 text-xs text-slate-400">
          "Today" is since {new Date(summary.businessDayStart).toLocaleString([], {
            weekday: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          (your configured day-end time)
        </p>
      )}
      <ErrorText>{error}</ErrorText>

      {summary && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Open orders today" value={summary.openOrdersToday} />
          <StatCard label="Closed orders today" value={summary.closedOrdersToday} />
          <StatCard label="Sales today" value={`₹${summary.salesToday.toFixed(2)}`} />
          <StatCard label="Pending KOT items" value={summary.pendingKotItems} />
        </div>
      )}

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-slate-800">Today's open orders</h2>
        <TableWrap>
          <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="pb-2">Customer</th>
              <th className="pb-2">Type</th>
              <th className="pb-2">Check-in</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {todayOrders.map((order) => (
              <tr key={order._id} className="border-t border-slate-100">
                <td className="py-1.5">{order.customerName}</td>
                <td className="py-1.5 capitalize">{order.orderType}</td>
                <td className="py-1.5">{new Date(order.checkinTime).toLocaleTimeString()}</td>
                <td className="py-1.5">
                  <Link to={`/admin/orders/${order._id}`} className="text-orange-600 hover:underline">
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {todayOrders.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-slate-400">
                  No open orders yet today
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

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-800">{value}</p>
    </Card>
  );
}
