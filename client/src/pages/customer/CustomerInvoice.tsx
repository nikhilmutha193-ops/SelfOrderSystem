import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api, clearStoredToken, extractErrorMessage, setActiveAuth } from "../../lib/apiClient";
import { useTableSession } from "../../lib/useTableSession";
import { Badge, Button, Card, ErrorText, Input } from "../../components/ui";
import ReviewFab from "../../components/ReviewFab";
import ChatFab from "../../components/ChatFab";
import type { OrderDetailResponse } from "../../lib/types";

const STATUS_TONE = {
  pending: "amber",
  preparing: "blue",
  ready: "green",
  served: "green",
  cancelled: "red",
} as const;

export default function CustomerInvoice() {
  const { orderId } = useTableSession();
  const navigate = useNavigate();
  const [data, setData] = useState<OrderDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [couponError, setCouponError] = useState<string | null>(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);

  const load = useCallback(() => {
    if (!orderId) return;
    api
      .get<OrderDetailResponse>(`/orders/${orderId}/invoice`)
      .then((res) => setData(res.data))
      .catch((err) => setError(extractErrorMessage(err)));
  }, [orderId]);

  useEffect(() => {
    if (!orderId) {
      navigate("/order/details", { replace: true });
      return;
    }
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, [orderId, load, navigate]);

  function logout() {
    clearStoredToken("table");
    setActiveAuth(null);
    navigate("/", { replace: true });
  }

  async function applyCoupon(e: React.FormEvent) {
    e.preventDefault();
    if (!orderId || !couponCode.trim()) return;
    setCouponError(null);
    setApplyingCoupon(true);
    try {
      await api.post(`/orders/${orderId}/coupon`, { code: couponCode.trim() });
      setCouponCode("");
      load();
    } catch (err) {
      setCouponError(extractErrorMessage(err));
    } finally {
      setApplyingCoupon(false);
    }
  }

  async function removeCoupon() {
    if (!orderId) return;
    setCouponError(null);
    try {
      await api.delete(`/orders/${orderId}/coupon`);
      load();
    } catch (err) {
      setCouponError(extractErrorMessage(err));
    }
  }

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return <p className="p-4 text-sm text-slate-500">Loading...</p>;

  const { order, items, totals } = data;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Your order</h1>
        <Badge tone={order.status === "closed" ? "green" : "amber"}>{order.status === "closed" ? "Paid" : "Open"}</Badge>
      </div>

      <Card className="mb-4">
        <p className="text-sm text-slate-600">Customer: {order.customerName}</p>
        <p className="text-sm text-slate-600">Phone: {order.customerPhone}</p>
      </Card>

      <Card className="mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="pb-2">Item</th>
              <th className="pb-2">Qty</th>
              <th className="pb-2">Amount</th>
              <th className="pb-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item._id} className="border-t border-slate-100">
                <td className="py-1.5">
                  {item.foodName} {item.isJain && "(Jain)"}
                </td>
                <td className="py-1.5">{item.quantity}</td>
                <td className="py-1.5">₹{item.total.toFixed(2)}</td>
                <td className="py-1.5">
                  <Badge tone={STATUS_TONE[item.status]}>{item.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {order.status === "open" && (
        <Card className="mb-4">
          {order.couponCode ? (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">
                Coupon <span className="font-semibold text-green-700">{order.couponCode}</span> applied
              </span>
              <button className="text-red-600 hover:underline" onClick={removeCoupon}>
                Remove
              </button>
            </div>
          ) : (
            <form onSubmit={applyCoupon} className="flex items-end gap-2">
              <label className="flex-1 text-sm font-medium text-slate-700">
                Have a coupon code?
                <Input
                  className="mt-1 uppercase"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  placeholder="e.g. WELCOME10"
                />
              </label>
              <Button type="submit" disabled={applyingCoupon || !couponCode.trim()}>
                {applyingCoupon ? "Applying..." : "Apply"}
              </Button>
            </form>
          )}
          <ErrorText>{couponError}</ErrorText>
        </Card>
      )}

      <Card className="mb-4">
        <div className="flex justify-between text-sm text-slate-600">
          <span>Subtotal</span>
          <span>₹{totals.subtotal.toFixed(2)}</span>
        </div>
        {totals.discount > 0 && (
          <div className="flex justify-between text-sm text-green-700">
            <span>Discount{order.couponCode ? ` (${order.couponCode})` : ""}</span>
            <span>-₹{totals.discount.toFixed(2)}</span>
          </div>
        )}
        {totals.taxLines.map((t) => (
          <div key={t.name} className="flex justify-between text-sm text-slate-600">
            <span>
              {t.name} ({t.percent}%)
            </span>
            <span>₹{t.amount.toFixed(2)}</span>
          </div>
        ))}
        <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-800">
          <span>Grand total</span>
          <span>₹{totals.grandTotal.toFixed(2)}</span>
        </div>
      </Card>

      <div className="flex gap-3">
        {order.status === "open" && <Button onClick={() => navigate("/order/menu")}>Order more</Button>}
        <Button variant="secondary" onClick={logout}>
          Logout
        </Button>
      </div>

      {order.status === "closed" && <ReviewFab />}
      <ChatFab />
    </div>
  );
}
