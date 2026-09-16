import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, extractErrorMessage } from "../../lib/apiClient";
import { Badge, Button, Card, ErrorText, Input, Select, TableWrap } from "../../components/ui";
import type { MenuCategory, OrderCoupon, OrderDetailResponse, PaymentMethod } from "../../lib/types";

const STATUS_TONE = {
  pending: "amber",
  preparing: "blue",
  ready: "green",
  served: "green",
  cancelled: "red",
} as const;

export default function OrderDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<OrderDetailResponse | null>(null);
  const [menu, setMenu] = useState<MenuCategory[]>([]);
  const [selectedFood, setSelectedFood] = useState("");
  const [quantity, setQuantity] = useState(1);
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

  const flatFoods = menu.flatMap((c) => c.subcategories.flatMap((s) => s.foodItems));

  async function addItem() {
    if (!selectedFood || !orderId) return;
    setError(null);
    try {
      await api.post(`/orders/${orderId}/items`, { items: [{ foodItemId: selectedFood, quantity }] });
      setQuantity(1);
      load();
    } catch (err) {
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Order Detail</h1>
        <Button variant="secondary" onClick={() => navigate(-1)}>
          Back
        </Button>
      </div>

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
          <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
            <label className="text-sm font-medium text-slate-700">
              Add item
              <Select className="mt-1" value={selectedFood} onChange={(e) => setSelectedFood(e.target.value)}>
                <option value="">Select food</option>
                {flatFoods.map((f) => (
                  <option key={f._id} value={f._id}>
                    {f.name} - ₹{f.price}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Qty
              <Input
                className="mt-1 w-20"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </label>
            <Button onClick={addItem}>Add</Button>
          </div>
        )}
      </Card>

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
