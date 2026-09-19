import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, extractErrorMessage } from "../lib/apiClient";
import { useAdmin, can } from "../lib/adminAuth";
import type { Order, PaymentMethod } from "../lib/types";

/** Open orders older than this need a staff decision: complete & close, or cancel. */
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

/** Quick access to every open order, and a resolve prompt for ones sitting open past 6 hours. */
export default function ActiveOrders() {
  const { profile } = useAdmin();
  const allowed = can(profile, "orders");
  const [orders, setOrders] = useState<Order[]>([]);
  const [open, setOpen] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api
      .get<Order[]>("/orders", { params: { status: "open" } })
      .then((res) => setOrders(res.data))
      .catch(() => {
        /* transient - keep the last known list */
      });
  }, []);

  useEffect(() => {
    if (!allowed) return;
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [allowed, load]);

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
    if (!window.confirm(`Complete & close ${o.customerName || "this order"}? It will be marked paid (${method}).`)) return;
    setError(null);
    setBusy(true);
    try {
      await api.patch(`/orders/${o._id}/pay`, { paymentMethod: method });
      setResolvingId(null);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancelOrder(o: Order) {
    if (!window.confirm(`Cancel ${o.customerName || "this order"}? This cannot be undone.`)) return;
    setError(null);
    setBusy(true);
    try {
      await api.patch(`/orders/${o._id}/cancel`);
      setResolvingId(null);
      load();
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
          load();
        }}
        aria-label="Active orders"
        aria-expanded={open}
        className="relative inline-flex h-11 items-center gap-2 rounded-md px-2 text-sm font-medium text-slate-600 hover:bg-slate-100 sm:px-3"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M9 5h6M9 5a2 2 0 1 0 4 0M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 12h6M9 16h4" strokeLinecap="round" />
        </svg>
        <span className="hidden sm:inline">Active orders</span>
        {orders.length > 0 && (
          <span
            className={`flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-[11px] font-bold text-white ${
              stale.length > 0 ? "bg-red-600" : "bg-orange-600"
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
        <div className="absolute right-0 z-50 mt-1 w-80 max-w-[90vw] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {error && <p className="bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

          {stale.length > 0 && (
            <div className="border-b border-slate-100">
              <div className="bg-red-50 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-red-700">
                Needs attention · open 6h+ ({stale.length})
              </div>
              <div className="max-h-[45vh] overflow-y-auto">
                {stale.map((o) => (
                  <div key={o._id} className="border-b border-slate-50 px-3 py-2.5 last:border-b-0">
                    <div className="flex items-center justify-between gap-2">
                      <Link to={`/admin/orders/${o._id}`} onClick={() => setOpen(false)} className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-800">{o.customerName || "Guest"}</span>
                        <span className="block text-xs text-slate-500">
                          {orderLabel(o)} · <span className="font-medium text-red-600">{ageLabel(o.checkinTime)}</span>
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
                            className="min-h-[36px] flex-1 rounded-md border border-slate-300 px-2 text-sm"
                          >
                            <option value="cash">Cash</option>
                            <option value="online">Online</option>
                            <option value="card">Card</option>
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

          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
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
                  className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-slate-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-800">{o.customerName || "Guest"}</span>
                    <span className="block text-xs text-slate-500">{orderLabel(o)}</span>
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
    </div>
  );
}
