import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, extractErrorMessage } from "../../lib/apiClient";
import { Badge, Button, Card, ErrorText, Input, Select } from "../../components/ui";
import type { Order, OrderStatus, OrderType } from "../../lib/types";

const STATUS_TONE = { open: "amber", closed: "green", cancelled: "red" } as const;

export default function Orders() {
  const [searchParams, setSearchParams] = useSearchParams();
  const type = (searchParams.get("type") as OrderType) || "";
  const status = (searchParams.get("status") as OrderStatus) || "";
  const today = searchParams.get("today") === "true";
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";

  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params: Record<string, string> = {};
    if (type) params.type = type;
    if (status) params.status = status;
    if (today) {
      params.today = "true";
    } else {
      if (from) params.from = from;
      if (to) params.to = to;
    }
    api
      .get<Order[]>("/orders", { params })
      .then((res) => setOrders(res.data))
      .catch((err) => setError(extractErrorMessage(err)));
  }, [type, status, today, from, to]);

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === "from" || key === "to") next.delete("today");
    setSearchParams(next);
  }

  function selectToday() {
    const next = new URLSearchParams(searchParams);
    next.set("today", "true");
    next.delete("from");
    next.delete("to");
    setSearchParams(next);
  }

  // Yesterday/Tomorrow are always relative to the actual current date, not to
  // whatever day happens to be selected right now.
  function selectDayFromToday(offsetDays: number) {
    const base = new Date();
    base.setDate(base.getDate() + offsetDays);
    const value = base.toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
    const next = new URLSearchParams(searchParams);
    next.delete("today");
    next.set("from", value);
    next.set("to", value);
    setSearchParams(next);
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-800">Orders</h1>

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-slate-700">
            Type
            <Select className="mt-1" value={type} onChange={(e) => updateParam("type", e.target.value)}>
              <option value="">All</option>
              <option value="dine-in">Dine-in</option>
              <option value="delivery">Delivery</option>
            </Select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Status
            <Select className="mt-1" value={status} onChange={(e) => updateParam("status", e.target.value)}>
              <option value="">All</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            From
            <Input
              className="mt-1"
              type="date"
              value={today ? "" : from}
              onChange={(e) => updateParam("from", e.target.value)}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            To
            <Input
              className="mt-1"
              type="date"
              value={today ? "" : to}
              onChange={(e) => updateParam("to", e.target.value)}
            />
          </label>
          <Button type="button" variant="secondary" onClick={() => selectDayFromToday(-1)}>
            Yesterday
          </Button>
          <Button type="button" variant={today ? "primary" : "secondary"} onClick={selectToday}>
            Today
          </Button>
          <Button type="button" variant="secondary" onClick={() => selectDayFromToday(1)}>
            Tomorrow
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          "Today" and the From/To range use your restaurant's day-end time (Restaurant Settings), so late-night
          orders placed after midnight but before that cutoff still count toward the previous business day instead
          of splitting at midnight.
        </p>
      </Card>

      <ErrorText>{error}</ErrorText>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="pb-2">Customer</th>
              <th className="pb-2">Type</th>
              <th className="pb-2">Check-in</th>
              <th className="pb-2">Status</th>
              <th className="pb-2">Payment</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order._id} className="border-t border-slate-100">
                <td className="py-1.5">{order.customerName}</td>
                <td className="py-1.5 capitalize">
                  {order.orderType === "delivery" ? `Delivery (${order.deliveryProvider})` : "Dine-in"}
                </td>
                <td className="py-1.5">{new Date(order.checkinTime).toLocaleString()}</td>
                <td className="py-1.5">
                  <Badge tone={STATUS_TONE[order.status]}>{order.status}</Badge>
                </td>
                <td className="py-1.5 capitalize">{order.paymentMethod}</td>
                <td className="py-1.5">
                  <Link className="text-orange-600 hover:underline" to={`/admin/orders/${order._id}`}>
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-slate-400">
                  No orders found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
