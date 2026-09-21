import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api, clearStoredToken, extractErrorMessage, setActiveAuth } from "../../lib/apiClient";
import { useTableSession } from "../../lib/useTableSession";
import { Badge, Button, Card, ErrorText, Input } from "../../components/ui";
import { ReviewDialog } from "../../components/ReviewFab";
import ChatFab from "../../components/ChatFab";
import { renderPrepMessage } from "../../lib/prepTime";
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
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutRequested, setCheckoutRequested] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const navigate = useNavigate();
  const [data, setData] = useState<OrderDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [couponError, setCouponError] = useState<string | null>(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [ratedDishes, setRatedDishes] = useState<Record<string, number>>({});

  async function rateDish(foodItemId: string, rating: number) {
    setRatedDishes((r) => ({ ...r, [foodItemId]: rating }));
    try {
      await api.post("/reviews/food", { foodItemId, rating });
    } catch {
      // Non-critical (e.g. already rated) - keep the stars shown either way.
    }
  }

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

  /** Payment happens at the counter, so this just notifies staff through the chat
   *  thread they already watch - it raises their unread badge like any message. */
  async function requestCheckout() {
    if (!orderId) return;
    setError(null);
    setCheckingOut(true);
    try {
      await api.post(`/orders/${orderId}/chat`, {
        message: "We'd like to checkout please - we'll pay at the counter.",
      });
      setCheckoutRequested(true);
      // Checkout ends the visit, so the table session closes with it - otherwise the
      // next guest on this device would inherit the previous order.
      setTimeout(logout, 4000);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setCheckingOut(false);
    }
  }

  async function downloadInvoice() {
    if (!orderId) return;
    setError(null);
    setDownloading(true);
    try {
      const res = await api.get(`/orders/${orderId}/invoice/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `invoice-${orderId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoking immediately can cancel the download on some mobile browsers.
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setDownloading(false);
    }
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
  const prepMessage =
    order.status === "open"
      ? renderPrepMessage(data.prepMessageTemplate, order.estimatedReadyAt, items, data.prepBufferMinutes)
      : null;

  // Cancelled items are settled, so they don't hold the table up.
  const activeItems = items.filter((i) => i.status !== "cancelled");
  const pendingCount = activeItems.filter((i) => i.status !== "served").length;
  const orderComplete = order.status === "closed" || (activeItems.length > 0 && pendingCount === 0);

  return (
    <div className="mx-auto max-w-2xl px-4 pt-6 pb-32">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Your order</h1>
        <Badge tone={order.status === "closed" ? "green" : "amber"}>{order.status === "closed" ? "Paid" : "Open"}</Badge>
      </div>

      <Card className="mb-4">
        <p className="text-sm text-slate-600">Customer: {order.customerName}</p>
        <p className="text-sm text-slate-600">Phone: {order.customerPhone}</p>
      </Card>

      <Card className="mb-4">
        {prepMessage && (
          <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">{prepMessage}</p>
        )}
        {/* Four short columns fit a phone, so this lays out as a plain table - a
            forced min-width only produced a sideways scroll over empty space. */}
        <table className="w-full table-auto text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="pb-2">Item</th>
              <th className="pb-2 text-center">Qty</th>
              <th className="pb-2 text-right">Amount</th>
              <th className="pb-2 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item._id} className="border-t border-slate-100 align-top">
                <td className="py-2 pr-2">
                  {item.foodName}
                  {(item.modifiers?.length || item.note) && (
                    <span className="mt-0.5 block text-xs text-slate-400">
                      {[...(item.modifiers?.map((m) => m.label) ?? []), item.note].filter(Boolean).join(", ")}
                    </span>
                  )}
                </td>
                <td className="py-2 text-center tabular-nums">{item.quantity}</td>
                <td className="py-2 pl-2 text-right tabular-nums whitespace-nowrap">₹{item.total.toFixed(2)}</td>
                <td className="py-2 pl-2 text-right">
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

      {/* Rate each dish (deduped) - guest reviews feed the dish's average on the menu. */}
      {(() => {
        const dishes = Array.from(new Map(items.filter((i) => i.status !== "cancelled").map((i) => [i.foodItemId, i.foodName])));
        if (dishes.length === 0) return null;
        return (
          <Card className="mb-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-700">Rate the dishes</h2>
            <div className="flex flex-col gap-2">
              {dishes.map(([foodItemId, foodName]) => (
                <div key={foodItemId} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{foodName}</span>
                  <div className="flex shrink-0">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        aria-label={`Rate ${foodName} ${n} of 5`}
                        onClick={() => rateDish(foodItemId, n)}
                        className={`px-0.5 text-xl leading-none ${
                          (ratedDishes[foodItemId] ?? 0) >= n ? "text-amber-500" : "text-slate-300"
                        }`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        );
      })()}

      {checkoutRequested && (
        <p className="mb-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          Staff have been notified. Please pay at the counter - your bill is ready. Signing you out...
        </p>
      )}

      {!orderComplete && (
        <p className="mb-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {pendingCount > 0
            ? `Checkout and your invoice unlock once all items are served - ${pendingCount} still on the way.`
            : "Add something from the menu to start your order."}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        {order.status === "open" && <Button onClick={() => navigate("/order/menu")}>Order more</Button>}
        {order.status === "open" && (
          <Button onClick={requestCheckout} disabled={!orderComplete || checkingOut || checkoutRequested}>
            {checkingOut ? "Notifying..." : checkoutRequested ? "Checkout requested" : "Checkout"}
          </Button>
        )}
        <Button variant="secondary" onClick={downloadInvoice} disabled={!orderComplete || downloading}>
          {downloading ? "Preparing..." : "Download invoice"}
        </Button>
        <Button variant="secondary" onClick={() => setFeedbackOpen(true)}>
          ★ Leave feedback
        </Button>
      </div>

      <ReviewDialog
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        defaultName={order.customerName}
      />
      <ChatFab />
    </div>
  );
}
