import { ClipboardList } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { can, useAdmin } from "../../../lib/adminAuth";
import type { Order, PaymentMethod } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { POLL } from "../../../shared/api/queryClient";
import ReasonDialog from "../../../shared/ui/ReasonDialog";
import { useCancelOrder, useOrders, usePayOrder } from "../queries";

const STALE_MS = 6 * 60 * 60 * 1000;

function orderLabel(o: Order): string {
  if (o.orderType === "dine-in") {
    return typeof o.tableId === "object" && o.tableId?.code ? `Table ${o.tableId.code}` : "Counter";
  }
  if (o.orderType === "takeaway") return "Take away";
  return `Delivery${o.deliveryProvider ? ` (${o.deliveryProvider})` : ""}`;
}

function ageLabel(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m old` : `${m}m old`;
}

export default function ActiveOrders() {
  const { profile } = useAdmin();
  const allowed = can(profile, "orders");
  const [open, setOpen] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancellingBill, setCancellingBill] = useState<Order | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const openOrders = useOrders({ status: "unpaid" }, { enabled: allowed, refetchInterval: POLL.activeOrders });
  const orders = openOrders.data ?? [];
  const payOrder = usePayOrder();
  const cancelOpenOrder = useCancelOrder();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!allowed) return null;

  const stale = orders.filter((o) => Date.now() - new Date(o.checkinTime).getTime() > STALE_MS);
  const fresh = orders.filter((o) => Date.now() - new Date(o.checkinTime).getTime() <= STALE_MS);

  async function closeOrder(o: Order) {
    if (!window.confirm(`Complete & close ${o.customerName || "this order"}? It will be marked paid (${method}).`))
      return;
    setError(null);
    setBusy(true);
    try {
      await payOrder.mutateAsync({ orderId: o._id, paymentMethod: method });
      setResolvingId(null);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancelOrder(o: Order) {
    if (o.status === "billed") {
      setCancellingBill(o);
      return;
    }
    if (!window.confirm(`Cancel ${o.customerName || "this order"}? This cannot be undone.`)) return;
    setError(null);
    setBusy(true);
    try {
      await cancelOpenOrder.mutateAsync({ orderId: o._id });
      setResolvingId(null);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          openOrders.refetch();
        }}
        aria-label="Active orders"
        aria-expanded={open}
        className="relative inline-flex h-11 items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 sm:h-10 sm:px-3"
      >
        <ClipboardList size={20} aria-hidden="true" />
        <span className="hidden 2xl:inline">Active orders</span>
        {orders.length > 0 && (
          <span
            className={`flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-[11px] font-bold text-white ${
              stale.length > 0 ? "bg-red-600" : "bg-slate-800"
            }`}
          >
            {orders.length}
          </span>
        )}
        {stale.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-[4.25rem] z-50 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-pop animate-pop-in sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-96">
          {error && <p className="bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

          {stale.length > 0 && (
            <div className="border-b border-slate-100">
              <div className="bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-700">
                Needs attention · open 6h+ ({stale.length})
              </div>
              <div className="max-h-[45vh] overflow-y-auto">
                {stale.map((o) => (
                  <div key={o._id} className="border-b border-slate-50 px-3 py-2.5 last:border-b-0">
                    <div className="flex items-center justify-between gap-2">
                      <Link to={`/admin/orders/${o._id}`} onClick={() => setOpen(false)} className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-800">
                          {o.customerName || "Guest"}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {orderLabel(o)}
                          {o.status === "billed" && " · Bill printed"} ·{" "}
                          <span className="font-medium text-red-600">{ageLabel(o.checkinTime)}</span>
                        </span>
                      </Link>
                      {resolvingId !== o._id && (
                        <button
                          type="button"
                          onClick={() => {
                            setResolvingId(o._id);
                            setMethod("cash");
                          }}
                          className="shrink-0 rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                        >
                          Resolve
                        </button>
                      )}
                    </div>

                    {resolvingId === o._id && (
                      <div className="mt-2 flex flex-col gap-2 rounded-lg bg-slate-50 p-2">
                        <div className="flex items-center gap-2">
                          <select
                            value={method}
                            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                            className="ui-select min-h-[40px] flex-1 rounded-lg border border-slate-300 bg-white pr-8 pl-2 text-sm"
                          >
                            <option value="cash">Cash</option>
                            <option value="online">Online</option>
                            <option value="card">Card</option>
                            <option value="upi">UPI</option>
                            <option value="wallet">Wallet</option>
                          </select>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => closeOrder(o)}
                            className="min-h-[36px] rounded-md bg-green-600 px-2.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                          >
                            Complete &amp; close
                          </button>
                        </div>
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => cancelOrder(o)}
                            className="rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            Cancel order
                          </button>
                          <button
                            type="button"
                            onClick={() => setResolvingId(null)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-b border-slate-100 px-4 py-2.5 text-xs font-semibold text-slate-500">
            Open orders ({fresh.length})
          </div>
          {fresh.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-slate-400">
              {stale.length > 0 ? "No other open orders." : "No open orders right now."}
            </p>
          ) : (
            <div className="max-h-[45vh] overflow-y-auto">
              {fresh.map((o) => (
                <Link
                  key={o._id}
                  to={`/admin/orders/${o._id}`}
                  onClick={() => setOpen(false)}
                  className="flex min-h-[52px] items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-slate-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-800">{o.customerName || "Guest"}</span>
                    <span className="block text-xs text-slate-500">
                      {orderLabel(o)}
                      {o.status === "billed" && ` · Bill ${o.invoiceNumber ?? "printed"}`}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">
                    {new Date(o.checkinTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
      <ReasonDialog
        open={cancellingBill !== null}
        title={cancellingBill ? `Cancel bill ${cancellingBill.invoiceNumber ?? ""}?` : ""}
        description="The bill keeps its number and shows as cancelled in the invoice register."
        confirmLabel="Cancel bill"
        danger
        onCancel={() => setCancellingBill(null)}
        onConfirm={async ({ note }) => {
          await cancelOpenOrder.mutateAsync({ orderId: cancellingBill!._id, reason: note });
          setCancellingBill(null);
          setResolvingId(null);
        }}
      />
    </div>
  );
}
