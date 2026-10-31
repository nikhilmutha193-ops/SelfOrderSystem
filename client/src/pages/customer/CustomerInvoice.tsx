import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { ReviewDialog } from "../../components/ReviewFab";
import ChatFab from "../../features/chat/components/ChatFab";
import { useSendChatMessage } from "../../features/chat/queries";
import { ordersApi } from "../../features/orders/api";
import { refundState } from "../../features/orders/status";
import {
  useApplyCoupon,
  useOrderInvoice,
  useRemoveCoupon,
} from "../../features/orders/queries";
import { PayOnlineButton } from "../../features/payments/components/PayOnlineButton";
import { renderPrepMessage } from "../../lib/prepTime";
import { useGuestAccess } from "../../lib/useGuestAccess";
import { useServiceFlow } from "../../lib/useServiceFlow";
import { useTableSession } from "../../lib/useTableSession";
import {
  api,
  clearStoredToken,
  extractErrorMessage,
  setActiveAuth,
  storeToken,
} from "../../shared/api/client";
import { POLL } from "../../shared/api/queryClient";
import { Badge, Button, Card, ErrorText, Input } from "../../shared/ui/ui";
import UpiQr from "../../shared/ui/UpiQr";

const STATUS_TONE = {
  pending: "amber",
  preparing: "blue",
  ready: "green",
  served: "green",
  cancelled: "red",
} as const;

/** A guest who signed in by token number says which table they are at, to order more from it. */
function PickTableCard() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function seat(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ token: string }>("/auth/table/token-seat", {
        code: code.trim(),
      });
      storeToken("table", res.data.token);
      setActiveAuth({ role: "table", token: res.data.token });
      navigate("/order/menu", { replace: true });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4">
      <form onSubmit={seat}>
        <p className="text-sm font-semibold text-slate-900">
          Sitting at a table?
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Enter your table number to order more from your table.
        </p>
        {error && <ErrorText>{error}</ErrorText>}
        <div className="mt-3 flex gap-2">
          <Input
            aria-label="Table number"
            placeholder="Table number"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <Button type="submit" loading={busy} disabled={!code.trim()}>
            Order from table
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default function CustomerInvoice() {
  const { orderId, via } = useTableSession();
  const access = useGuestAccess();
  // Cafe flow: the order is paid at the counter first, then it goes to the kitchen and gets a token.
  const cafe = useServiceFlow() === "cafe";
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutRequested, setCheckoutRequested] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const invoiceQuery = useOrderInvoice(orderId, POLL.guestInvoice);
  const data = invoiceQuery.data ?? null;
  const [actionError, setActionError] = useState<string | null>(null);
  const error =
    actionError ??
    (invoiceQuery.error ? extractErrorMessage(invoiceQuery.error) : null);
  const [couponCode, setCouponCode] = useState("");
  const [couponError, setCouponError] = useState<string | null>(null);
  const applyOrderCoupon = useApplyCoupon();
  const removeOrderCoupon = useRemoveCoupon();
  const sendChat = useSendChatMessage();
  const applyingCoupon = applyOrderCoupon.isPending;
  const [ratedDishes, setRatedDishes] = useState<Record<string, number>>({});

  async function rateDish(foodItemId: string, rating: number) {
    setRatedDishes((r) => ({ ...r, [foodItemId]: rating }));
    try {
      await api.post("/reviews/food", { foodItemId, rating });
    } catch {
      // Non-critical (e.g. already rated) - keep the stars shown either way.
    }
  }

  useEffect(() => {
    if (!orderId) navigate("/order/details", { replace: true });
  }, [orderId, navigate]);

  function logout() {
    clearStoredToken("table");
    setActiveAuth(null);
    navigate("/", { replace: true });
  }

  async function requestCheckout() {
    if (!orderId) return;
    setActionError(null);
    setCheckingOut(true);
    try {
      await sendChat.mutateAsync({
        orderId,
        message: "We'd like to checkout please - we'll pay at the counter.",
      });
      setCheckoutRequested(true);
      setTimeout(logout, 4000);
    } catch (err) {
      setActionError(extractErrorMessage(err));
    } finally {
      setCheckingOut(false);
    }
  }

  async function downloadInvoice() {
    if (!orderId) return;
    setActionError(null);
    setDownloading(true);
    try {
      const url = URL.createObjectURL(await ordersApi.invoicePdf(orderId));
      const link = document.createElement("a");
      link.href = url;
      link.download = `invoice-${orderId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoking immediately can cancel the download on some mobile browsers.
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      setActionError(extractErrorMessage(err));
    } finally {
      setDownloading(false);
    }
  }

  async function applyCoupon(e: React.FormEvent) {
    e.preventDefault();
    if (!orderId || !couponCode.trim()) return;
    setCouponError(null);
    try {
      await applyOrderCoupon.mutateAsync({ orderId, code: couponCode.trim() });
      setCouponCode("");
    } catch (err) {
      setCouponError(extractErrorMessage(err));
    }
  }

  async function removeCoupon() {
    if (!orderId) return;
    setCouponError(null);
    try {
      await removeOrderCoupon.mutateAsync(orderId);
    } catch (err) {
      setCouponError(extractErrorMessage(err));
    }
  }

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return <p className="p-4 text-sm text-slate-500">Loading...</p>;

  const { order, items, totals } = data;
  // Paying when ordering: each order is paid at the counter (or by UPI) and only then cooked.
  const payFirst = data.dineInPayment === "upfront";
  const cooking =
    order.status === "open" || (payFirst && order.status === "closed");
  const prepMessage = cooking
    ? renderPrepMessage(
        data.prepMessageTemplate,
        order.estimatedReadyAt,
        items,
        data.prepBufferMinutes,
      )
    : null;

  // Cancelled items are settled, so they don't hold the table up.
  const activeItems = items.filter((i) => i.status !== "cancelled");
  const pendingCount = activeItems.filter((i) => i.status !== "served").length;
  const awaitingAccept =
    !payFirst &&
    !cafe &&
    order.status === "open" &&
    data.guestOrderMode === "accept" &&
    activeItems.some((i) => i.kotRound == null);
  const awaitingPayment =
    payFirst &&
    !cafe &&
    (order.status === "open" || order.status === "billed") &&
    activeItems.length > 0;
  const tokens = [
    ...new Set(
      activeItems
        .map((i) => i.tokenNumber)
        .filter((n): n is number => n != null),
    ),
  ].sort((a, b) => a - b);
  const orderComplete =
    order.status === "closed" ||
    order.status === "billed" ||
    (activeItems.length > 0 && pendingCount === 0);
  const refund = refundState(order);
  const statusBadge =
    order.status === "closed"
      ? refund === "full"
        ? { tone: "red" as const, label: "Refunded" }
        : refund === "partial"
          ? { tone: "amber" as const, label: "Partly refunded" }
          : { tone: "green" as const, label: "Paid" }
      : order.status === "billed"
        ? { tone: "blue" as const, label: "Bill ready" }
        : order.status === "cancelled"
          ? { tone: "red" as const, label: "Cancelled" }
          : { tone: "amber" as const, label: "Open" };

  return (
    <div className="mx-auto max-w-2xl px-4 pt-6 pb-32">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Your order</h1>
        <Badge tone={statusBadge.tone}>{statusBadge.label}</Badge>
      </div>

      {awaitingPayment && (
        <Card className="mb-4">
          {data.onlinePayment ? (
            <>
              <p className="mb-3 text-sm font-medium text-slate-800">
                Pay now and your order goes straight to the kitchen.
              </p>
              <PayOnlineButton orderId={order._id} amount={totals.grandTotal} />
              <p className="mt-3 text-xs text-slate-500">
                Paying cash? Pay at the counter instead.
              </p>
            </>
          ) : (
            <p className="text-sm font-medium text-slate-800">
              Pay ₹{totals.grandTotal.toFixed(2)} at the counter
              {data.payment?.upiVpa ? " or scan to pay by UPI" : ""}. Your order
              goes to the kitchen as soon as it's paid.
            </p>
          )}
          {!data.onlinePayment && data.payment?.upiVpa && (
            <div className="mt-3">
              <UpiQr
                vpa={data.payment.upiVpa}
                payee={data.payment.upiPayeeName}
                amount={totals.grandTotal}
                note={order.invoiceNumber ?? "Order"}
              />
              <p className="mt-2 text-center text-xs text-slate-500">
                Show the payment confirmation at the counter so they can send
                your order.
              </p>
            </div>
          )}
        </Card>
      )}

      {order.status === "billed" && !payFirst && (
        <Card className="mb-4">
          <p className="text-sm text-blue-900">
            Your bill{order.invoiceNumber ? ` ${order.invoiceNumber}` : ""} is
            ready.{" "}
            {data.onlinePayment
              ? "Pay now from your phone, or at the counter."
              : data.payment?.upiVpa
                ? "Pay at the counter or scan to pay by UPI."
                : "Please pay at the counter."}
          </p>
          {data.onlinePayment && (
            <div className="mt-3">
              <PayOnlineButton orderId={order._id} amount={totals.grandTotal} />
            </div>
          )}
          {!data.onlinePayment && data.payment?.upiVpa && (
            <div className="mt-3">
              <UpiQr
                vpa={data.payment.upiVpa}
                payee={data.payment.upiPayeeName}
                amount={totals.grandTotal}
                note={order.invoiceNumber ?? "Bill"}
              />
              <p className="mt-2 text-center text-xs text-slate-500">
                Show the payment confirmation to staff so they can close your
                bill.
              </p>
            </div>
          )}
        </Card>
      )}

      {cafe && tokens.length > 0 && (
        <Card className="mb-4 text-center">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            {tokens.length > 1 ? "Your tokens" : "Your token"}
          </p>
          <p className="mt-1 text-5xl font-extrabold text-orange-600 tabular-nums">
            {tokens.join(" · ")}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            We will call this number when your order is ready.
          </p>
        </Card>
      )}

      {notice && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {notice}. Here is your order status.
        </p>
      )}
      {via === "token" && <PickTableCard />}

      {cafe && order.status === "open" && activeItems.length > 0 && (
        <Card className="mb-4">
          <p className="text-sm font-medium text-blue-900">
            Awaiting payment: please pay ₹{totals.grandTotal.toFixed(2)} at the
            counter. Your order goes to the kitchen as soon as it is paid.
          </p>
          {data.payment?.upiVpa && (
            <div className="mt-3">
              <UpiQr
                vpa={data.payment.upiVpa}
                payee={data.payment.upiPayeeName}
                amount={totals.grandTotal}
                note="Order"
              />
              <p className="mt-2 text-center text-xs text-slate-500">
                Show the payment confirmation to staff at the counter.
              </p>
            </div>
          )}
        </Card>
      )}

      <Card className="mb-4">
        <p className="text-sm text-slate-600">Customer: {order.customerName}</p>
        <p className="text-sm text-slate-600">Phone: {order.customerPhone}</p>
      </Card>

      {awaitingAccept && (
        <p className="mb-4 rounded-md bg-blue-50 px-3 py-2 text-sm font-medium text-blue-900">
          Waiting for the restaurant to accept your order. It goes to the
          kitchen as soon as they do.
        </p>
      )}

      <Card className="mb-4">
        {prepMessage && (
          <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
            {prepMessage}
          </p>
        )}
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
              <tr
                key={item._id}
                className="border-t border-slate-100 align-top"
              >
                <td className="py-2 pr-2">
                  {item.foodName}
                  {(item.modifiers?.length || item.note) && (
                    <span className="mt-0.5 block text-xs text-slate-400">
                      {[
                        ...(item.modifiers?.map((m) => m.label) ?? []),
                        item.note,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  )}
                </td>
                <td className="py-2 text-center tabular-nums">
                  {item.quantity}
                </td>
                <td className="py-2 pl-2 text-right tabular-nums whitespace-nowrap">
                  ₹{item.total.toFixed(2)}
                </td>
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
                Coupon{" "}
                <span className="font-semibold text-green-700">
                  {order.couponCode}
                </span>{" "}
                applied
              </span>
              <button
                className="text-red-600 hover:underline"
                onClick={removeCoupon}
              >
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
              <Button
                type="submit"
                disabled={applyingCoupon || !couponCode.trim()}
              >
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
            <span>
              Discount{order.couponCode ? ` (${order.couponCode})` : ""}
            </span>
            <span>-₹{totals.discount.toFixed(2)}</span>
          </div>
        )}
        {(totals.serviceCharge ?? 0) > 0 && (
          <div className="flex justify-between text-sm text-slate-600">
            <span>Service charge ({totals.serviceChargePercent}%)</span>
            <span>₹{(totals.serviceCharge ?? 0).toFixed(2)}</span>
          </div>
        )}
        {(totals.packagingCharge ?? 0) > 0 && (
          <div className="flex justify-between text-sm text-slate-600">
            <span>Packaging</span>
            <span>₹{(totals.packagingCharge ?? 0).toFixed(2)}</span>
          </div>
        )}
        {totals.taxLines.map((t) => (
          <div
            key={t.name}
            className="flex justify-between text-sm text-slate-600"
          >
            <span>
              {t.name} ({t.percent}%)
            </span>
            <span>₹{t.amount.toFixed(2)}</span>
          </div>
        ))}
        {totals.roundOff !== 0 && (
          <div className="flex justify-between text-sm text-slate-600">
            <span>Round off</span>
            <span>
              {totals.roundOff > 0 ? "+" : "-"}₹
              {Math.abs(totals.roundOff).toFixed(2)}
            </span>
          </div>
        )}
        <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-800">
          <span>Grand total</span>
          <span>₹{totals.grandTotal.toFixed(2)}</span>
        </div>
      </Card>

      {(() => {
        const dishes = Array.from(
          new Map(
            items
              .filter((i) => i.status !== "cancelled")
              .map((i) => [i.foodItemId, i.foodName]),
          ),
        );
        if (dishes.length === 0) return null;
        return (
          <Card className="mb-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-700">
              Rate the dishes
            </h2>
            <div className="flex flex-col gap-2">
              {dishes.map(([foodItemId, foodName]) => (
                <div
                  key={foodItemId}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                    {foodName}
                  </span>
                  <div className="flex shrink-0">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        aria-label={`Rate ${foodName} ${n} of 5`}
                        onClick={() => rateDish(foodItemId, n)}
                        className={`px-0.5 text-xl leading-none ${
                          (ratedDishes[foodItemId] ?? 0) >= n
                            ? "text-amber-500"
                            : "text-slate-300"
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
          Staff have been notified. Please pay at the counter - your bill is
          ready. Signing you out...
        </p>
      )}

      {!orderComplete && !payFirst && !cafe && (
        <p className="mb-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {pendingCount > 0
            ? `Checkout and your invoice unlock once all items are served - ${pendingCount} still on the way.`
            : "Add something from the menu to start your order."}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        {(order.status === "open" ||
          (payFirst && order.status === "closed")) && (
          <Button onClick={() => navigate("/order/menu")}>Order more</Button>
        )}
        {order.status === "open" && !payFirst && !cafe && (
          <Button
            onClick={requestCheckout}
            disabled={!orderComplete || checkingOut || checkoutRequested}
          >
            {checkingOut
              ? "Notifying..."
              : checkoutRequested
                ? "Checkout requested"
                : "Checkout"}
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={downloadInvoice}
          disabled={!orderComplete || downloading}
        >
          {downloading ? "Preparing..." : "Download invoice"}
        </Button>
        {access.showFeedback && (
          <Button variant="secondary" onClick={() => setFeedbackOpen(true)}>
            ★ Leave feedback
          </Button>
        )}
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
