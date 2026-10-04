import {
  ArrowLeft,
  Ban,
  CookingPot,
  FileText,
  Gift,
  LockOpen,
  Minus,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  RotateCcw,
  Send,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { BestsellerTag, FoodTypeIcon, RatingChip } from "../../../components/FoodBadges";
import { useAdmin } from "../../../lib/adminAuth";
import { renderPrepMessage } from "../../../lib/prepTime";
import { TENDER_LABELS, type MenuCategory, type MenuFoodItem } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { confirmDialog } from "../../../shared/ui/confirm";
import ReasonDialog from "../../../shared/ui/ReasonDialog";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorText,
  Field,
  IconButton,
  Input,
  Page,
  PageHeader,
  Select,
  Tabs,
} from "../../../shared/ui/ui";
import { useMenu } from "../../catalog/queries";
import { CustomerPanel } from "../../customers/components/CustomerPanel";
import { kitchenApi, openPdfInTab } from "../../kitchen/api";
import { usePrintKot } from "../../kitchen/queries";
import { usePrintingStatus } from "../../printing/queries";
import { ordersApi } from "../api";
import BillActions from "../components/BillActions";
import { EditOrderCustomerDialog } from "../components/EditOrderCustomerDialog";
import SettleDialog from "../components/SettleDialog";
import {
  useAddOrderItems,
  useApplyCoupon,
  useCancelOrder,
  useComplimentary,
  useGenerateBill,
  useOrder,
  useOrderCoupons,
  useRemoveCoupon,
  useReopenBill,
  useVoidBill,
} from "../queries";
import { orderStatusBadge, orderTypeLabel } from "../status";

type BillDialog = "reopen" | "cancelBill" | "void" | null;

const NO_MENU: MenuCategory[] = [];

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
  const [activeCat, setActiveCat] = useState("all");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [settleOpen, setSettleOpen] = useState(false);
  const [editCustomerOpen, setEditCustomerOpen] = useState(false);
  const [complimentaryItem, setComplimentaryItem] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [customerGstin, setCustomerGstin] = useState("");
  const [billDialog, setBillDialog] = useState<BillDialog>(null);
  const { profile } = useAdmin();
  const [couponCode, setCouponCode] = useState("");
  const [couponError, setCouponError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const printing = usePrintingStatus().data;
  const orderQuery = useOrder(orderId);
  const data = orderQuery.data ?? null;
  const offers = useOrderCoupons(orderId, data?.totals.subtotal).data ?? [];
  const menu = useMenu().data ?? NO_MENU;
  const addItems = useAddOrderItems();
  const printTicket = usePrintKot();
  const complimentary = useComplimentary();
  const cancelOrder = useCancelOrder();
  const generateBill = useGenerateBill();
  const reopenBill = useReopenBill();
  const voidBill = useVoidBill();
  const applyCoupon = useApplyCoupon();
  const removeOrderCoupon = useRemoveCoupon();
  const addingCart = addItems.isPending;
  const kotBusy = printTicket.isPending;
  const applyingCoupon = applyCoupon.isPending;
  const error = actionError ?? (orderQuery.error ? extractErrorMessage(orderQuery.error) : null);

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
      : (menu.find((c) => c._id === activeCat)?.subcategories.flatMap((s) => s.foodItems) ?? []);

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
    setActionError(null);
    try {
      await addItems.mutateAsync({
        orderId,
        items: Object.entries(cart).map(([foodItemId, quantity]) => ({
          foodItemId,
          quantity,
        })),
      });
      setCart({});
    } catch (err) {
      setActionError(extractErrorMessage(err));
    }
  }

  async function sendNewKot() {
    if (!orderId || kotBusy) return;
    setActionError(null);
    setNotice(null);
    if (printing?.printersConfigured) {
      try {
        const result = await printTicket.mutateAsync(orderId);
        if (!result.round) setActionError(result.message || "No new items to send to the kitchen");
        else setNotice(`KOT T${result.tokenNumber} sent to the kitchen printers`);
      } catch (err) {
        setActionError(extractErrorMessage(err));
      }
      return;
    }
    const pdfTab = window.open("", "_blank");
    try {
      const result = await printTicket.mutateAsync(orderId);
      if (!result.round) {
        pdfTab?.close();
        setActionError(result.message || "No new items to send to the kitchen");
        return;
      }
      const round = result.round;
      await openPdfInTab(pdfTab, () => kitchenApi.kotPdf(orderId, round));
    } catch (err) {
      pdfTab?.close();
      setActionError(extractErrorMessage(err));
    }
  }

  async function reprintKot(round: number) {
    if (!orderId) return;
    setActionError(null);
    setNotice(null);
    if (printing?.printersConfigured) {
      try {
        await kitchenApi.reprintKot(orderId, round);
        setNotice("Reprint sent to the kitchen printers");
      } catch (err) {
        setActionError(extractErrorMessage(err));
      }
      return;
    }
    const pdfTab = window.open("", "_blank");
    try {
      await openPdfInTab(pdfTab, () => kitchenApi.kotPdf(orderId, round));
    } catch (err) {
      setActionError(extractErrorMessage(err));
    }
  }

  async function cancel() {
    if (!orderId) return;
    if (data?.order.status === "billed") {
      setBillDialog("cancelBill");
      return;
    }
    if (
      !(await confirmDialog({
        title: "Cancel this entire order?",
        message: "Every item on it is cancelled. This can't be undone.",
        confirmLabel: "Cancel order",
        cancelLabel: "Keep order",
      }))
    )
      return;
    setActionError(null);
    try {
      await cancelOrder.mutateAsync({ orderId });
    } catch (err) {
      setActionError(extractErrorMessage(err));
    }
  }

  async function makeBill() {
    if (!orderId) return;
    setActionError(null);
    try {
      await generateBill.mutateAsync({
        orderId,
        customerGstin: customerGstin.trim() || undefined,
      });
      setCustomerGstin("");
    } catch (err) {
      setActionError(extractErrorMessage(err));
    }
  }

  async function confirmBillDialog(reason: string) {
    if (!orderId) return;
    if (billDialog === "reopen") await reopenBill.mutateAsync({ orderId, reason });
    if (billDialog === "cancelBill") await cancelOrder.mutateAsync({ orderId, reason });
    if (billDialog === "void") await voidBill.mutateAsync({ orderId, reason });
    setBillDialog(null);
  }

  async function applyCode(code: string) {
    if (!orderId || !code.trim()) return;
    setCouponError(null);
    try {
      await applyCoupon.mutateAsync({ orderId, code: code.trim() });
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

  async function printInvoice() {
    if (!orderId) return;
    setActionError(null);
    // Open synchronously so it isn't popup-blocked once the await below resolves.
    const pdfTab = window.open("", "_blank");
    try {
      await openPdfInTab(pdfTab, () => ordersApi.invoicePdf(orderId));
    } catch (err) {
      setActionError(extractErrorMessage(err));
    }
  }

  async function printBillOnPrinter() {
    if (!orderId) return;
    setActionError(null);
    setNotice(null);
    try {
      await ordersApi.printBill(orderId);
      setNotice("Bill sent to the bill printer");
    } catch (err) {
      setActionError(extractErrorMessage(err));
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
        const entry = map.get(r) ?? {
          round: r,
          token: i.tokenNumber,
          count: 0,
        };
        entry.count += i.quantity;
        map.set(r, entry);
        return map;
      }, new Map<number, { round: number; token: number | null; count: number }>())
      .values()
  ).sort((a, b) => b.round - a.round);

  const statusBadge = orderStatusBadge(order);
  const facts = [
    orderTypeLabel(order),
    order.members ? `${order.members} guest${order.members === 1 ? "" : "s"}` : null,
    order.customerPhone || null,
    order.customerGstin ? `GSTIN ${order.customerGstin}` : null,
  ].filter(Boolean);
  const canSettle = order.status === "open" || order.status === "billed";

  const itemsCard = (
    <Card>
      <CardHeader
        icon={UtensilsCrossed}
        title="Items"
        description={`${items.filter((i) => i.status !== "cancelled").length} on this order`}
        className="mb-3"
      />
      {prepMessage && (
        <Alert tone="warning" className="mb-3">
          {prepMessage}
        </Alert>
      )}
      {items.length === 0 ? (
        <EmptyState icon={UtensilsCrossed} title="No items yet" description="Add dishes below." />
      ) : (
        <ul className="-mx-4 divide-y divide-slate-100 border-y border-slate-100 sm:-mx-5">
          {items.map((item) => {
            const extras = [...(item.modifiers?.map((m) => m.label) ?? []), item.note].filter(Boolean).join(", ");
            return (
              <li
                key={item._id}
                className={`flex items-center gap-3 px-4 py-3 sm:px-5 ${item.status === "cancelled" ? "opacity-60" : ""}`}
              >
                <span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 px-1.5 text-sm font-bold text-slate-800 tabular-nums">
                  {item.quantity}×
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={`flex flex-wrap items-center gap-1.5 font-medium text-slate-900 ${
                      item.status === "cancelled" ? "line-through" : ""
                    }`}
                  >
                    {item.foodName}
                    {item.isJain && <span className="text-xs font-semibold text-emerald-700">Jain</span>}
                    {item.complimentary && <Badge tone="green">On the house</Badge>}
                  </p>
                  {extras && <p className="truncate text-xs text-slate-500">{extras}</p>}
                  {(item.components ?? []).length > 0 && (
                    <p className="text-xs text-slate-500">
                      Includes{" "}
                      {item.components!.map((p) => (p.quantity > 1 ? `${p.quantity}× ${p.name}` : p.name)).join(", ")}
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge tone={STATUS_TONE[item.status]} dot>
                      {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                    </Badge>
                    <span className="text-xs text-slate-400">
                      {item.kotRound != null ? `KOT round ${item.kotRound}` : "Not sent"}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-semibold text-slate-900 tabular-nums">₹{item.total.toFixed(2)}</span>
                  {order.status === "open" && item.status !== "cancelled" && !item.complimentary && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Gift}
                      className="!text-emerald-700 hover:!bg-emerald-50"
                      onClick={() =>
                        setComplimentaryItem({
                          id: item._id,
                          name: item.foodName,
                        })
                      }
                    >
                      Comp
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {order.status === "open" && (
        <div className="mt-5 flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-slate-900">Add items</h3>
          {menu.length > 0 && (
            <Tabs
              size="sm"
              value={activeCat}
              onChange={setActiveCat}
              items={[{ value: "all", label: "All items" }, ...menu.map((c) => ({ value: c._id, label: c.name }))]}
            />
          )}
          {activeFoods.length === 0 ? (
            <p className="text-sm text-slate-500">No dishes in this category.</p>
          ) : (
            <div className={`grid gap-3 sm:grid-cols-2 ${embedded ? "" : "2xl:grid-cols-3"}`}>
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
            <div className="sticky bottom-20 z-10 flex items-center justify-between gap-3 rounded-xl bg-slate-900 px-4 py-3 text-white shadow-pop md:bottom-4">
              <span className="text-sm font-semibold">
                {cartCount} item{cartCount === 1 ? "" : "s"} · ₹{cartTotal.toFixed(2)}
              </span>
              <Button icon={Plus} onClick={addCartToOrder} loading={addingCart}>
                {addingCart ? "Adding..." : "Add to order"}
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );

  const kotCard = (pendingCount > 0 || printedRounds.length > 0) && (
    <Card>
      <CardHeader icon={CookingPot} title="Kitchen tickets" className="mb-3" />
      {pendingCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <span className="text-sm font-medium text-amber-900">
            {pendingCount} item{pendingCount === 1 ? "" : "s"} not sent to the kitchen yet
          </span>
          <Button icon={Send} onClick={sendNewKot} loading={kotBusy}>
            {kotBusy ? "Sending..." : "Send new items (new token)"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Everything has been sent to the kitchen.</p>
      )}
      {printedRounds.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {printedRounds.map((r) => (
            <div
              key={r.round}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-2 text-slate-700">
                {r.token != null && (
                  <span className="rounded-md bg-orange-600 px-2 py-0.5 text-xs font-bold text-white">T{r.token}</span>
                )}
                Round {r.round}
                <span className="text-slate-400">
                  · {r.count} item{r.count === 1 ? "" : "s"}
                </span>
              </span>
              <Button size="sm" variant="secondary" icon={RotateCcw} onClick={() => reprintKot(r.round)}>
                Reprint KOT
              </Button>
            </div>
          ))}
          <p className="text-xs text-slate-400">Reprinting keeps the same token number.</p>
        </div>
      )}
    </Card>
  );

  const totalsCard = (
    <Card>
      <CardHeader icon={ReceiptText} title="Bill" className="mb-3" />
      {order.status === "open" && (
        <div className="mb-4 flex flex-col gap-2 border-b border-slate-100 pb-4">
          {order.couponCode ? (
            <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
              <span className="text-emerald-800">
                <span className="font-semibold">{order.couponCode}</span> applied
              </span>
              <Button size="sm" variant="ghost" className="!text-red-600 hover:!bg-red-50" onClick={removeCoupon}>
                Remove
              </Button>
            </div>
          ) : (
            <Field label="Coupon" htmlFor="order-coupon">
              <div className="flex gap-2">
                <Select id="order-coupon" value={couponCode} onChange={(e) => setCouponCode(e.target.value)}>
                  <option value="">{offers.length === 0 ? "No coupons available" : "Select coupon"}</option>
                  {offers.map((offer) => (
                    <option key={offer.code} value={offer.code} disabled={!offer.eligible}>
                      {offer.code} - {offer.type === "percent" ? `${offer.value}% off` : `₹${offer.value} off`}
                      {offer.eligible ? ` (saves ₹${offer.discount.toFixed(2)})` : ` - ${offer.reason}`}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => applyCode(couponCode)}
                  loading={applyingCoupon}
                  disabled={!couponCode}
                >
                  Apply
                </Button>
              </div>
            </Field>
          )}
          <ErrorText>{couponError}</ErrorText>
        </div>
      )}
      <dl className="flex flex-col gap-1.5 text-sm">
        <div className="flex justify-between text-slate-600">
          <dt>Subtotal</dt>
          <dd className="tabular-nums">₹{totals.subtotal.toFixed(2)}</dd>
        </div>
        {(totals.couponDiscount ?? totals.discount) > 0 && (
          <div className="flex justify-between text-emerald-700">
            <dt>Coupon{order.couponCode ? ` (${order.couponCode})` : ""}</dt>
            <dd className="tabular-nums">-₹{(totals.couponDiscount ?? totals.discount).toFixed(2)}</dd>
          </div>
        )}
        {(totals.manualDiscount ?? 0) > 0 && (
          <div className="flex justify-between gap-2 text-emerald-700">
            <dt className="min-w-0 truncate">
              Discount
              {order.manualDiscount?.reason ? ` (${order.manualDiscount.reason})` : ""}
            </dt>
            <dd className="tabular-nums">-₹{(totals.manualDiscount ?? 0).toFixed(2)}</dd>
          </div>
        )}
        {(totals.loyaltyDiscount ?? 0) > 0 && (
          <div className="flex justify-between text-emerald-700">
            <dt>
              Loyalty points
              {order.loyaltyRedeem ? ` (${order.loyaltyRedeem.points})` : ""}
            </dt>
            <dd className="tabular-nums">-₹{(totals.loyaltyDiscount ?? 0).toFixed(2)}</dd>
          </div>
        )}
        {(totals.serviceCharge ?? 0) > 0 && (
          <div className="flex justify-between text-slate-600">
            <dt>Service charge ({totals.serviceChargePercent}%)</dt>
            <dd className="tabular-nums">₹{(totals.serviceCharge ?? 0).toFixed(2)}</dd>
          </div>
        )}
        {(totals.packagingCharge ?? 0) > 0 && (
          <div className="flex justify-between text-slate-600">
            <dt>Packaging</dt>
            <dd className="tabular-nums">₹{(totals.packagingCharge ?? 0).toFixed(2)}</dd>
          </div>
        )}
        <div className="flex justify-between text-slate-600">
          <dt>Taxable value</dt>
          <dd className="tabular-nums">₹{totals.taxableAmount.toFixed(2)}</dd>
        </div>
        {totals.taxLines.map((t) => (
          <div key={t.name} className="flex justify-between text-slate-600">
            <dt>
              {t.name} ({t.percent}%)
            </dt>
            <dd className="tabular-nums">₹{t.amount.toFixed(2)}</dd>
          </div>
        ))}
        {totals.roundOff !== 0 && (
          <div className="flex justify-between text-slate-600">
            <dt>Round off</dt>
            <dd className="tabular-nums">
              {totals.roundOff > 0 ? "+" : "-"}₹{Math.abs(totals.roundOff).toFixed(2)}
            </dd>
          </div>
        )}
        <div className="mt-2 flex items-baseline justify-between border-t border-slate-200 pt-3">
          <dt className="text-base font-semibold text-slate-900">Grand total</dt>
          <dd className="text-2xl font-bold text-slate-900 tabular-nums">₹{totals.grandTotal.toFixed(2)}</dd>
        </div>
      </dl>
      {(order.payments ?? []).length > 0 && (
        <div className="mt-3 flex flex-col gap-1 border-t border-slate-100 pt-3 text-sm text-slate-600">
          {order.payments!.map((p, i) => (
            <div key={i} className="flex justify-between gap-2">
              <span className="min-w-0">
                Paid by {TENDER_LABELS[p.method]}
                {p.reference ? ` (${p.reference})` : ""}
                {p.change ? ` · change ₹${p.change.toFixed(2)}` : ""}
              </span>
              <span className="tabular-nums">₹{p.amount.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      {order.status === "open" && (
        <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4">
          <Field
            label={
              <>
                Customer GSTIN <span className="font-normal text-slate-400">(optional)</span>
              </>
            }
            htmlFor="customer-gstin"
          >
            <Input
              id="customer-gstin"
              className="uppercase"
              maxLength={15}
              value={customerGstin}
              onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())}
              placeholder="29ABCDE1234F1Z5"
            />
          </Field>
          <Button variant="secondary" icon={FileText} onClick={makeBill} loading={generateBill.isPending}>
            {generateBill.isPending ? "Generating..." : "Generate bill"}
          </Button>
          <p className="text-xs text-slate-500">
            Gives the bill the next invoice number and locks the order. Reopen it if something changes.
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4">
        {canSettle && (
          <Button size="lg" variant="success" icon={Wallet} onClick={() => setSettleOpen(true)}>
            Settle bill
          </Button>
        )}
        <div className="flex flex-wrap gap-2 [&>*]:flex-1">
          <Button variant="secondary" icon={Printer} onClick={printInvoice}>
            {order.invoiceNumber && order.status !== "open" ? "Print invoice" : "Bill preview"}
          </Button>
          {printing?.billPrinterConfigured && order.invoiceNumber && order.status !== "open" && (
            <Button variant="secondary" icon={Printer} onClick={printBillOnPrinter}>
              Bill printer
            </Button>
          )}
        </div>
        {order.status === "billed" && (
          <Button variant="secondary" icon={LockOpen} onClick={() => setBillDialog("reopen")}>
            Reopen bill
          </Button>
        )}
        {canSettle && (
          <Button variant="ghost" icon={Ban} className="!text-red-600 hover:!bg-red-50" onClick={cancel}>
            {order.status === "billed" ? "Cancel bill" : "Cancel order"}
          </Button>
        )}
        {order.status === "closed" && profile?.isOwner && (
          <Button
            variant="ghost"
            icon={Ban}
            className="!text-red-600 hover:!bg-red-50"
            onClick={() => setBillDialog("void")}
          >
            Void bill
          </Button>
        )}
      </div>
    </Card>
  );

  const Wrapper = embedded ? "div" : Page;

  return (
    <Wrapper className="flex flex-col gap-5 sm:gap-6">
      {!embedded && (
        <PageHeader
          back={
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Back
            </button>
          }
          title={
            <span className="flex flex-wrap items-center gap-3">
              {order.customerName || "Guest"}
              <Badge tone={statusBadge.tone} dot>
                {statusBadge.label}
              </Badge>
              {order.status === "open" && (
                <IconButton
                  size="sm"
                  icon={Pencil}
                  label="Edit guest details"
                  onClick={() => setEditCustomerOpen(true)}
                />
              )}
            </span>
          }
          description={facts.join(" · ")}
          actions={
            order.invoiceNumber && (
              <div className="text-left sm:text-right">
                <p className="font-mono text-sm font-semibold text-slate-900">{order.invoiceNumber}</p>
                {order.billedAt && (
                  <p className="text-xs text-slate-500">Billed {new Date(order.billedAt).toLocaleString()}</p>
                )}
              </div>
            )
          }
        />
      )}
      {embedded && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div>
              <p className="font-semibold text-slate-900">{order.customerName || "Guest"}</p>
              <p className="text-sm text-slate-500">{facts.join(" · ")}</p>
            </div>
            {order.status === "open" && (
              <IconButton size="sm" icon={Pencil} label="Edit guest details" onClick={() => setEditCustomerOpen(true)} />
            )}
          </div>
          <Badge tone={statusBadge.tone} dot>
            {statusBadge.label}
          </Badge>
        </div>
      )}

      {(order.voidReason || order.cancelReason) && (
        <Alert tone="error" title={order.voidedAt ? "Voided" : "Cancelled"}>
          Reason: {order.voidReason || order.cancelReason}
        </Alert>
      )}
      {order.offline && (
        <Alert tone={order.offline.mismatch && order.status !== "closed" ? "warning" : "info"} title="Billed offline">
          Taken on the POS while offline on{" "}
          {new Date(order.offline.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} and synced
          later. Provisional total ₹{order.offline.clientTotal.toFixed(2)}.
          {order.offline.note && order.status !== "closed" && <> {order.offline.note}</>}
        </Alert>
      )}
      {notice && <Alert tone="success">{notice}</Alert>}
      <ErrorText>{error}</ErrorText>

      <div
        className={`grid items-start gap-5 ${embedded ? "2xl:grid-cols-[minmax(0,1fr)_22rem]" : "xl:grid-cols-[minmax(0,1fr)_24rem]"}`}
      >
        <div className="flex min-w-0 flex-col gap-5">
          {itemsCard}
          {kotCard}
        </div>
        <div className={`flex min-w-0 flex-col gap-5 ${embedded ? "" : "xl:sticky xl:top-24"}`}>
          {totalsCard}
          <BillActions data={data} />
          {order.status !== "cancelled" && (
            <Card>
              <CardHeader title="Guest" description="Loyalty points and WhatsApp bills." className="mb-3" />
              <CustomerPanel order={order} />
            </Card>
          )}
        </div>
      </div>

      <SettleDialog
        open={settleOpen}
        orderId={order._id}
        total={totals.grandTotal}
        invoiceNumber={order.invoiceNumber}
        upi={data.payment}
        onClose={() => setSettleOpen(false)}
      />

      <EditOrderCustomerDialog order={order} open={editCustomerOpen} onClose={() => setEditCustomerOpen(false)} />

      <ReasonDialog
        open={complimentaryItem !== null}
        title={`Make ${complimentaryItem?.name ?? "this item"} complimentary?`}
        description="The item stays on the bill at no charge and still counts for the kitchen and reports."
        confirmLabel="Make complimentary"
        onCancel={() => setComplimentaryItem(null)}
        onConfirm={async ({ note }) => {
          await complimentary.mutateAsync({
            itemId: complimentaryItem!.id,
            reason: note,
          });
          setComplimentaryItem(null);
        }}
      />

      <ReasonDialog
        open={billDialog !== null}
        title={
          billDialog === "reopen"
            ? `Reopen bill ${order.invoiceNumber ?? ""}?`
            : billDialog === "void"
              ? `Void bill ${order.invoiceNumber ?? ""}?`
              : `Cancel bill ${order.invoiceNumber ?? ""}?`
        }
        description={
          billDialog === "reopen"
            ? "The order unlocks for changes and keeps the same invoice number. The reason goes in the audit log."
            : billDialog === "void"
              ? "The paid bill stays in the invoice register marked as voided. This cannot be undone."
              : "The bill keeps its number and shows as cancelled in the invoice register."
        }
        confirmLabel={billDialog === "reopen" ? "Reopen bill" : billDialog === "void" ? "Void bill" : "Cancel bill"}
        danger={billDialog !== "reopen"}
        onCancel={() => setBillDialog(null)}
        onConfirm={({ note }) => confirmBillDialog(note)}
      />
    </Wrapper>
  );
}

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
    <div
      className={`flex items-center gap-3 rounded-xl border bg-white p-3 transition-colors ${
        qty > 0 ? "border-orange-300 ring-1 ring-orange-200" : "border-slate-200"
      }`}
    >
      {food.imageUrl ? (
        <img
          src={food.imageUrl}
          alt={food.name}
          loading="lazy"
          className="h-14 w-14 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-orange-100 to-amber-50 text-lg font-bold text-orange-400">
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
        <p className="text-sm font-bold text-slate-800 tabular-nums">₹{food.price.toFixed(2)}</p>
      </div>

      <div className="w-24 shrink-0">
        {qty === 0 ? (
          <button
            type="button"
            onClick={onAdd}
            className="flex h-11 w-full items-center justify-center gap-1 rounded-lg border border-orange-600 bg-white text-sm font-bold tracking-wide text-orange-700 hover:bg-orange-50"
          >
            <Plus size={16} aria-hidden="true" />
            ADD
          </button>
        ) : (
          <div className="flex h-11 w-full items-center justify-between rounded-lg bg-orange-600 px-0.5 text-white">
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove one ${food.name}`}
              className="flex h-full w-9 items-center justify-center"
            >
              <Minus size={18} aria-hidden="true" />
            </button>
            <span className="text-base font-bold tabular-nums">{qty}</span>
            <button
              type="button"
              onClick={onAdd}
              aria-label={`Add one ${food.name}`}
              className="flex h-full w-9 items-center justify-center"
            >
              <Plus size={18} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
