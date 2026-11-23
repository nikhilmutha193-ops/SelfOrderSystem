import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { ServedReleasePrompt } from "../../components/ServedReleasePrompt";
import { ReviewDialog } from "../../components/ReviewFab";
import ChatFab from "../../features/chat/components/ChatFab";
import { useSendChatMessage } from "../../features/chat/queries";
import { ordersApi } from "../../features/orders/api";
import { refundState } from "../../features/orders/status";
import {
  useApplyCoupon,
  useMyOrders,
  useOrderInvoice,
  useRemoveCoupon,
} from "../../features/orders/queries";
import { MyOrdersCard } from "./MyOrdersCard";
import { PayOnlineButton } from "../../features/payments/components/PayOnlineButton";
import type { MyOrder, OrderDetailResponse } from "../../lib/types";
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

/** Colour and wording of a token number, from how far the kitchen has got with its dishes. */
const TOKEN_STATES = {
  received: { step: 0, tile: "bg-amber-50", label: "Order received", text: "text-amber-500", pill: "bg-amber-100 text-amber-800" },
  preparing: { step: 1, tile: "bg-blue-50", label: "Being prepared", text: "text-blue-600", pill: "bg-blue-100 text-blue-800" },
  ready: { step: 2, tile: "bg-emerald-50", label: "Ready, collect now", text: "text-emerald-600", pill: "bg-emerald-100 text-emerald-800" },
  served: { step: 3, tile: "bg-slate-50", label: "Served", text: "text-slate-400", pill: "bg-slate-100 text-slate-600" },
} as const;

const NO_ORDERS: MyOrder[] = [];

/** The ways a guest can pay their own order, as the owner allows them (Billing settings → guest payment options). */
function GuestPayCard({
  data,
  title,
  note,
  onCounter,
  counterBusy = false,
  counterDone = false,
}: {
  data: OrderDetailResponse;
  title: string;
  note: string;
  /** Tells the staff the guest will pay at the counter (the same request as Checkout). */
  onCounter?: () => void;
  counterBusy?: boolean;
  counterDone?: boolean;
}) {
  const { order, totals } = data;
  const online = !!data.onlinePayment;
  const upi = !!data.payment?.upiVpa;
  const counter = data.payOptions?.counter !== false;
  return (
    <Card className="mb-4">
      <p className="text-sm font-medium text-slate-800">{title}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">₹{totals.grandTotal.toFixed(2)}</p>
      {online && totals.grandTotal > 0 && (
        <div className="mt-3">
          <PayOnlineButton orderId={order._id} amount={totals.grandTotal} />
        </div>
      )}
      {upi && data.payment && totals.grandTotal > 0 && (
        <div className="mt-3">
          <UpiQr
            vpa={data.payment.upiVpa}
            payee={data.payment.upiPayeeName}
            amount={totals.grandTotal}
            note={order.invoiceNumber ?? "Order"}
          />
          <p className="mt-2 text-center text-xs text-slate-500">{note}</p>
        </div>
      )}
      {counter && onCounter ? (
        <div className="mt-3">
          <Button
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={onCounter}
            disabled={counterBusy || counterDone}
          >
            {counterBusy ? "Notifying..." : counterDone ? "Staff notified" : "Pay at the counter (cash or card)"}
          </Button>
        </div>
      ) : (
        counter && <p className="mt-3 text-xs text-slate-500">You can also pay cash or card at the counter.</p>
      )}
      {!online && !upi && !counter && (
        <p className="mt-3 text-xs text-slate-500">Please ask the staff to take your payment.</p>
      )}
    </Card>
  );
}

export default function CustomerInvoice() {
  const { orderId: sessionOrderId, via } = useTableSession();
  // An earlier round of this table session can be opened with ?order=<id>.
  const [searchParams, setSearchParams] = useSearchParams();
  const orderId = searchParams.get("order") || sessionOrderId;
  const myOrders = useMyOrders(!!sessionOrderId && via !== "token", POLL.guestInvoice).data ?? NO_ORDERS;
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
      // After the message, because releasing the table ends this guest's sign-in.
      await ordersApi.payAtCounter(orderId);
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
    (payFirst || cafe) &&
    (order.status === "open" || order.status === "billed") &&
    activeItems.length > 0;
  const tokens = [
    ...new Set(
      activeItems
        .map((i) => i.tokenNumber)
        .filter((n): n is number => n != null),
    ),
  ].sort((a, b) => a - b);
  const tokenStates = tokens.map((token) => {
    const own = activeItems.filter((i) => i.tokenNumber === token);
    const every = (...states: string[]) => own.every((i) => states.includes(i.status));
    const state = every("served")
      ? TOKEN_STATES.served
      : every("ready", "served")
        ? TOKEN_STATES.ready
        : own.some((i) => i.status === "preparing" || i.status === "ready" || i.status === "served")
          ? TOKEN_STATES.preparing
          : TOKEN_STATES.received;
    const round = own.find((i) => i.kotRound != null)?.kotRound ?? null;
    return { token, round, ...state };
  });
  // Served tokens drop out of the big tiles and are listed plainly under "Served".
  const liveTokens = tokenStates.filter((t) => t.step < 3);
  const servedTokens = tokenStates.filter((t) => t.step === 3);
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
          : awaitingPayment
            ? { tone: "amber" as const, label: "Awaiting payment" }
            : { tone: "amber" as const, label: "Open" };

  return (
    <div className="mx-auto max-w-2xl px-4 pt-6 pb-32">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Your order</h1>
        <div className="flex items-center gap-2">
          <Badge tone={statusBadge.tone}>{statusBadge.label}</Badge>
          {(order.status === "open" || (payFirst && order.status === "closed")) && (
            <Button size="sm" icon={Plus} onClick={() => navigate("/order/menu")}>
              Order more
            </Button>
          )}
        </div>
      </div>

      <ServedReleasePrompt />

      <MyOrdersCard
        payFirst={payFirst || cafe}
        orders={myOrders}
        viewingId={orderId ?? ""}
        onSelect={(id) => setSearchParams(id === sessionOrderId ? {} : { order: id }, { replace: true })}
      />

      {awaitingPayment && (
        <GuestPayCard
          data={data}
          title="Pay now and your order goes straight to the kitchen."
          note="Show the payment confirmation at the counter so they can send your order."
        />
      )}

      {order.status === "billed" && !payFirst && (
        <GuestPayCard
          data={data}
          title={`Your bill${order.invoiceNumber ? ` ${order.invoiceNumber}` : ""} is ready. Choose how to pay.`}
          note="Show the payment confirmation to staff so they can close your bill."
        />
      )}

      {order.status === "open" && !payFirst && !cafe && pendingCount === 0 && activeItems.length > 0 && (
        <GuestPayCard
          data={data}
          title="Everything has been served. Choose how to pay."
          note="Show the payment confirmation to staff so they can close your bill."
          onCounter={() => void requestCheckout()}
          counterBusy={checkingOut}
          counterDone={checkoutRequested}
        />
      )}

      {liveTokens.length > 0 && (
        <Card className="mb-4 text-center">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            {liveTokens.length > 1 ? "Your tokens" : "Your token"}
          </p>
          <div
            className={`mt-3 grid gap-2 ${liveTokens.length === 1 ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3"}`}
          >
            {liveTokens.map((t) => (
              <div
                key={t.token}
                className={`flex flex-col items-center rounded-xl px-2 py-3 ${liveTokens.length > 1 ? "odd:last:col-span-2 sm:odd:last:col-span-1" : ""} ${t.tile}`}
              >
                <p className={`${liveTokens.length > 1 ? "text-4xl" : "text-5xl"} leading-none font-extrabold tabular-nums ${t.text}`}>{t.token}</p>
                {t.round != null && <p className="mt-1 text-xs text-slate-500">Round {t.round}</p>}
                <span className={`mt-2 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${t.pill}`}>{t.label}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-sm text-slate-600">We will call this number when your order is ready.</p>
        </Card>
      )}
      {servedTokens.length > 0 && (
        <Card className="mb-4">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Served</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            {servedTokens.map((t) => (
              <span key={t.token} className="rounded-md bg-slate-100 px-2 py-0.5 font-semibold text-slate-700 tabular-nums">
                {t.token}
              </span>
            ))}
            <span className="text-xs text-slate-400">already served</span>
          </p>
        </Card>
      )}

      {notice && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {notice}. Here is your order status.
        </p>
      )}
      {via === "token" && <PickTableCard />}

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
                  {item.kotRound != null && (
                    <span className="block text-[11px] leading-tight font-semibold text-orange-700">
                      Round {item.kotRound}
                    </span>
                  )}
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
        {(totals.extraCharges ?? []).map((c) => (
          <div key={c.name} className="flex justify-between text-sm text-slate-600">
            <span>{c.name}</span>
            <span>₹{c.amount.toFixed(2)}</span>
          </div>
        ))}
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
              .filter((i) => i.status === "served")
              .map((i) => [i.foodItemId, i.foodName]),
          ),
        );
        if (dishes.length === 0) return null;
        return (
          <Card className="mb-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-700">
              Rate the dishes
            </h2>
            <p className="mb-2 text-xs text-slate-500">Dishes you have been served.</p>
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
          Staff have been notified. Please pay at the counter - your table is
          free now and your bill is waiting there. Signing you out...
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
        {access.showFeedback && activeItems.length > 0 && pendingCount === 0 && (
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
