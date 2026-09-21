import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, extractErrorMessage } from "../../lib/apiClient";
import { Badge, Button, Card, ErrorText, Select, TableWrap } from "../../components/ui";
import { BestsellerTag, FoodTypeIcon, RatingChip } from "../../components/FoodBadges";
import { renderPrepMessage } from "../../lib/prepTime";
import type { MenuCategory, MenuFoodItem, OrderCoupon, OrderDetailResponse, PaymentMethod } from "../../lib/types";

const STATUS_TONE = {
  pending: "amber",
  preparing: "blue",
  ready: "green",
  served: "green",
  cancelled: "red",
} as const;

export default function OrderDetail({
  orderId: orderIdProp,
  embedded = false,
}: { orderId?: string; embedded?: boolean } = {}) {
  const params = useParams<{ orderId: string }>();
  const orderId = orderIdProp ?? params.orderId;
  const navigate = useNavigate();
  const [data, setData] = useState<OrderDetailResponse | null>(null);
  const [menu, setMenu] = useState<MenuCategory[]>([]);
  const [activeCat, setActiveCat] = useState("all");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [addingCart, setAddingCart] = useState(false);
  const [kotBusy, setKotBusy] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [couponCode, setCouponCode] = useState("");
  const [couponError, setCouponError] = useState<string | null>(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [offers, setOffers] = useState<OrderCoupon[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadOffers = useCallback(() => {
    if (!orderId) return;
    api
      .get<{ coupons: OrderCoupon[] }>(`/orders/${orderId}/coupons`)
      .then((res) => setOffers(res.data.coupons))
      .catch(() => setOffers([])); // the picker is a convenience; typing a code still works
  }, [orderId]);

  const load = useCallback(() => {
    if (!orderId) return;
    api
      .get<OrderDetailResponse>(`/orders/${orderId}`)
      .then((res) => setData(res.data))
      .catch((err) => setError(extractErrorMessage(err)));
  }, [orderId]);

  useEffect(load, [load]);
  // Adding items moves the subtotal, which changes which coupons qualify.
  useEffect(loadOffers, [loadOffers, data?.totals.subtotal]);

  useEffect(() => {
    api.get<MenuCategory[]>("/menu").then((res) => setMenu(res.data));
  }, []);

  // Every dish across the menu, for cart price/name lookups.
  const foodById = useMemo(() => {
    const map = new Map<string, MenuFoodItem>();
    for (const c of menu) for (const s of c.subcategories) for (const f of s.foodItems) map.set(f._id, f);
    return map;
  }, [menu]);

  // "all" is a pseudo-tab that lists every dish across categories.
  const activeFoods =
    activeCat === "all"
      ? Array.from(foodById.values())
      : menu.find((c) => c._id === activeCat)?.subcategories.flatMap((s) => s.foodItems) ?? [];

  const cartCount = Object.values(cart).reduce((sum, q) => sum + q, 0);
  const cartTotal = Object.entries(cart).reduce((sum, [id, q]) => sum + (foodById.get(id)?.price ?? 0) * q, 0);

  // If a selected category disappears (menu edited), fall back to the All tab.
  useEffect(() => {
    if (activeCat !== "all" && menu.length > 0 && !menu.some((c) => c._id === activeCat)) setActiveCat("all");
  }, [menu, activeCat]);

  function incCart(foodId: string) {
    setCart((prev) => ({ ...prev, [foodId]: (prev[foodId] ?? 0) + 1 }));
  }
  function decCart(foodId: string) {
    setCart((prev) => {
      const next = { ...prev };
      const q = (next[foodId] ?? 0) - 1;
      if (q <= 0) delete next[foodId];
      else next[foodId] = q;
      return next;
    });
  }

  async function addCartToOrder() {
    if (!orderId || cartCount === 0) return;
    setError(null);
    setAddingCart(true);
    try {
      await api.post(`/orders/${orderId}/items`, {
        items: Object.entries(cart).map(([foodItemId, quantity]) => ({ foodItemId, quantity })),
      });
      setCart({});
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setAddingCart(false);
    }
  }

  /** Sends only the not-yet-printed items to the kitchen: new round, new token. */
  async function sendNewKot() {
    if (!orderId || kotBusy) return;
    setError(null);
    setKotBusy(true);
    const pdfTab = window.open("", "_blank");
    try {
      const res = await api.post<{ round: number | null; message?: string }>(`/orders/${orderId}/kot/print`);
      if (!res.data.round) {
        pdfTab?.close();
        setError(res.data.message || "No new items to send to the kitchen");
        return;
      }
      const pdf = await api.get(`/orders/${orderId}/kot/${res.data.round}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(pdf.data);
      if (pdfTab) pdfTab.location.href = url;
      load();
    } catch (err) {
      pdfTab?.close();
      setError(extractErrorMessage(err));
    } finally {
      setKotBusy(false);
    }
  }

  /** Re-opens an already-printed round's ticket. Same token - nothing is re-allocated. */
  async function reprintKot(round: number) {
    if (!orderId) return;
    setError(null);
    const pdfTab = window.open("", "_blank");
    try {
      const pdf = await api.get(`/orders/${orderId}/kot/${round}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(pdf.data);
      if (pdfTab) pdfTab.location.href = url;
    } catch (err) {
      pdfTab?.close();
      setError(extractErrorMessage(err));
    }
  }

  async function pay() {
    if (!orderId) return;
    setError(null);
    try {
      await api.patch(`/orders/${orderId}/pay`, { paymentMethod });
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function cancel() {
    if (!orderId || !confirm("Cancel this entire order?")) return;
    setError(null);
    try {
      await api.patch(`/orders/${orderId}/cancel`);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function applyCode(code: string) {
    if (!orderId || !code.trim()) return;
    setCouponError(null);
    setApplyingCoupon(true);
    try {
      await api.post(`/orders/${orderId}/coupon`, { code: code.trim() });
      setCouponCode("");
      load();
      loadOffers();
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
      loadOffers();
    } catch (err) {
      setCouponError(extractErrorMessage(err));
    }
  }

  async function printInvoice() {
    if (!orderId) return;
    setError(null);
    // Open synchronously so it isn't popup-blocked once the await below resolves.
    const pdfTab = window.open("", "_blank");
    try {
      const res = await api.get(`/orders/${orderId}/invoice/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      if (pdfTab) pdfTab.location.href = url;
    } catch (err) {
      pdfTab?.close();
      setError(extractErrorMessage(err));
    }
  }

  if (error && !data) return <ErrorText>{error}</ErrorText>;
  if (!data) return <p className="text-sm text-slate-500">Loading...</p>;

  const { order, items, totals } = data;
  const prepMessage =
    order.status === "open"
      ? renderPrepMessage(data.prepMessageTemplate, order.estimatedReadyAt, items, data.prepBufferMinutes)
      : null;

  // Items not yet sent to the kitchen (their KOT round is still unassigned).
  const pendingToSend = items.filter((i) => i.kotRound == null && i.status !== "cancelled");
  const pendingCount = pendingToSend.reduce((sum, i) => sum + i.quantity, 0);
  // Printed rounds, each with its token, newest first - for reprinting.
  const printedRounds = Array.from(
    items
      .filter((i) => i.kotRound != null)
      .reduce((map, i) => {
        const r = i.kotRound as number;
        const entry = map.get(r) ?? { round: r, token: i.tokenNumber, count: 0 };
        entry.count += i.quantity;
        map.set(r, entry);
        return map;
      }, new Map<number, { round: number; token: number | null; count: number }>())
      .values()
  ).sort((a, b) => b.round - a.round);

  return (
    <div className="flex flex-col gap-6">
      {!embedded && (
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-800">Order Detail</h1>
          <Button variant="secondary" onClick={() => navigate(-1)}>
            Back
          </Button>
        </div>
      )}

      <Card>
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <p className="text-sm text-slate-600">Customer: {order.customerName}</p>
            <p className="text-sm text-slate-600">Phone: {order.customerPhone}</p>
            <p className="text-sm text-slate-600">Members: {order.members}</p>
            <p className="text-sm text-slate-600">
              Type:{" "}
              {order.orderType === "delivery"
                ? `Delivery (${order.deliveryProvider})`
                : order.orderType === "takeaway"
                  ? "Take away"
                  : "Dine-in"}
            </p>
          </div>
          <div>
            <Badge tone={order.status === "open" ? "amber" : order.status === "closed" ? "green" : "red"}>
              {order.status}
            </Badge>
          </div>
        </div>
      </Card>

      <ErrorText>{error}</ErrorText>

      <Card>
        <h2 className="mb-2 text-lg font-semibold text-slate-800">Items</h2>
        {prepMessage && (
          <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">{prepMessage}</p>
        )}
        <TableWrap>
          <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="pb-2">Item</th>
              <th className="pb-2">Qty</th>
              <th className="pb-2">Amount</th>
              <th className="pb-2">Status</th>
              <th className="pb-2">KOT round</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item._id} className="border-t border-slate-100">
                <td className="py-1.5">
                  {item.foodName} {item.isJain && "(Jain)"}
                  {(item.modifiers?.length || item.note) && (
                    <span className="mt-0.5 block text-xs text-slate-400">
                      {[...(item.modifiers?.map((m) => m.label) ?? []), item.note].filter(Boolean).join(", ")}
                    </span>
                  )}
                </td>
                <td className="py-1.5">{item.quantity}</td>
                <td className="py-1.5">₹{item.total.toFixed(2)}</td>
                <td className="py-1.5">
                  <Badge tone={STATUS_TONE[item.status]}>{item.status}</Badge>
                </td>
                <td className="py-1.5">{item.kotRound ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>

        {order.status === "open" && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="mb-2 text-sm font-semibold text-slate-700">Add items</p>

            {menu.length > 0 && (
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                {[{ _id: "all", name: "All items" }, ...menu].map((c) => (
                  <button
                    key={c._id}
                    type="button"
                    onClick={() => setActiveCat(c._id)}
                    className={`min-h-[36px] shrink-0 whitespace-nowrap rounded-xl px-3.5 text-sm font-semibold transition-colors ${
                      activeCat === c._id
                        ? "bg-orange-600 text-white shadow-sm"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}

            {activeFoods.length === 0 ? (
              <p className="text-sm text-slate-500">No dishes in this category.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {activeFoods.map((f) => (
                  <MenuPickCard
                    key={f._id}
                    food={f}
                    qty={cart[f._id] ?? 0}
                    onAdd={() => incCart(f._id)}
                    onRemove={() => decCart(f._id)}
                  />
                ))}
              </div>
            )}

            {cartCount > 0 && (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-orange-50 px-3 py-2">
                <span className="text-sm font-semibold text-orange-800">
                  {cartCount} item{cartCount === 1 ? "" : "s"} · ₹{cartTotal.toFixed(2)}
                </span>
                <Button className="rounded-xl" onClick={addCartToOrder} disabled={addingCart}>
                  {addingCart ? "Adding..." : "Add to order"}
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {(pendingCount > 0 || printedRounds.length > 0) && (
        <Card>
          <h2 className="mb-2 text-lg font-semibold text-slate-800">Kitchen tickets (KOT)</h2>
          {pendingCount > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 px-3 py-2">
              <span className="text-sm font-medium text-amber-900">
                {pendingCount} item{pendingCount === 1 ? "" : "s"} not sent to the kitchen yet
              </span>
              <Button className="rounded-xl" onClick={sendNewKot} disabled={kotBusy}>
                {kotBusy ? "Sending..." : "Send new items (new token)"}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-slate-500">All items have been sent to the kitchen.</p>
          )}

          {printedRounds.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Printed tickets</p>
              {printedRounds.map((r) => (
                <div
                  key={r.round}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  <span className="text-slate-700">
                    Round {r.round}
                    {r.token != null && (
                      <span className="ml-2 rounded-md bg-orange-600 px-2 py-0.5 text-xs font-bold text-white">
                        TOKEN {r.token}
                      </span>
                    )}
                    <span className="ml-2 text-slate-400">
                      {r.count} item{r.count === 1 ? "" : "s"}
                    </span>
                  </span>
                  <Button variant="secondary" className="rounded-xl" onClick={() => reprintKot(r.round)}>
                    Reprint KOT
                  </Button>
                </div>
              ))}
              <p className="text-xs text-slate-400">Reprinting keeps the same token number - it never issues a new one.</p>
            </div>
          )}
        </Card>
      )}

      {order.status === "open" && (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Coupon</h2>
          {order.couponCode ? (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">
                <span className="font-semibold text-green-700">{order.couponCode}</span> applied
              </span>
              <button className="text-red-600 hover:underline" onClick={removeCoupon}>
                Remove
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-sm font-medium text-slate-700">
                Select coupon
                <Select
                  className="mt-1 !w-64"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                >
                  <option value="">
                    {offers.length === 0 ? "No coupons available" : "Select coupon"}
                  </option>
                  {offers.map((offer) => (
                    <option key={offer.code} value={offer.code} disabled={!offer.eligible}>
                      {offer.code} - {offer.type === "percent" ? `${offer.value}% off` : `₹${offer.value} off`}
                      {offer.eligible ? ` (saves ₹${offer.discount.toFixed(2)})` : ` - ${offer.reason}`}
                    </option>
                  ))}
                </Select>
              </label>
              <Button type="button" onClick={() => applyCode(couponCode)} disabled={applyingCoupon || !couponCode}>
                {applyingCoupon ? "Applying..." : "Apply"}
              </Button>
            </div>
          )}
          <ErrorText>{couponError}</ErrorText>
        </Card>
      )}

      <Card>
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

      <div className="flex flex-wrap items-center gap-3">
        {order.status === "open" && (
          <>
            <Select className="w-40" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
              <option value="cash">Cash</option>
              <option value="online">Online</option>
              <option value="card">Card</option>
            </Select>
            <Button onClick={pay}>Mark paid</Button>
            <Button variant="danger" onClick={cancel}>
              Cancel order
            </Button>
          </>
        )}
        <Button variant="secondary" onClick={printInvoice}>
          Print invoice
        </Button>
      </div>
    </div>
  );
}

/** A menu-page-style dish card for the counter picker: image, badges, price and a +/- stepper. */
function MenuPickCard({
  food,
  qty,
  onAdd,
  onRemove,
}: {
  food: MenuFoodItem;
  qty: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      {food.imageUrl ? (
        <img src={food.imageUrl} alt={food.name} loading="lazy" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-100 to-amber-50 text-xl font-bold text-orange-400">
          {food.name.charAt(0).toUpperCase()}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <FoodTypeIcon type={food.foodType} />
          <RatingChip rating={food.rating} />
          {food.isBestseller && <BestsellerTag emoji={food.bestsellerEmoji} />}
        </div>
        <p className="mt-1 truncate text-sm font-semibold text-slate-900">{food.name}</p>
        <p className="text-sm font-bold text-slate-800">₹{food.price.toFixed(2)}</p>
      </div>

      <div className="w-24 shrink-0">
        {qty === 0 ? (
          <button
            onClick={onAdd}
            className="flex h-11 w-full items-center justify-center rounded-xl border border-orange-600 bg-white text-base font-bold tracking-wide text-orange-600 shadow-sm hover:bg-orange-50"
          >
            ADD
          </button>
        ) : (
          <div className="flex h-11 w-full items-center justify-between rounded-xl bg-orange-600 px-0.5 text-white shadow-sm">
            <button
              onClick={onRemove}
              aria-label={`Remove one ${food.name}`}
              className="flex h-full w-8 items-center justify-center text-xl font-bold leading-none"
            >
              −
            </button>
            <span className="text-base font-bold tabular-nums">{qty}</span>
            <button
              onClick={onAdd}
              aria-label={`Add one ${food.name}`}
              className="flex h-full w-8 items-center justify-center text-xl font-bold leading-none"
            >
              +
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
