import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, ChevronUp, CloudOff, ShoppingBasket } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import DishDialog from "../../../components/DishDialog";
import type { InvoiceTotals, PosMenu, PosMenuItem, PosOrderSummary, PosTable } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { useStaffTheme } from "../../../shared/theme";
import { ThemeToggleButton } from "../../../shared/ui/ThemeToggle";
import { CustomerPanel } from "../../customers/components/CustomerPanel";
import { kitchenApi, openPdfInTab } from "../../kitchen/api";
import { ordersApi } from "../../orders/api";
import SettleDialog from "../../orders/components/SettleDialog";
import { orderKeys, refreshOrderData } from "../../orders/queries";
import { usePrintingStatus } from "../../printing/queries";
import { MenuGrid } from "../components/MenuGrid";
import { OfflineBar } from "../components/OfflineBar";
import { OfflineSettleDialog } from "../components/OfflineSettleDialog";
import { OrderPanel } from "../components/OrderPanel";
import { TableMap } from "../components/TableMap";
import {
  addToOpenSale,
  finishSale,
  isOfflineError,
  offlineDetail,
  offlineTotals,
  syncOfflineSales,
  toOfflineLines,
  useOfflineSales,
  useOfflineSync,
  useOnlineStatus,
  type OfflinePayment,
  type OfflineTarget,
} from "../offline";
import { kotHtml, printHtml, receiptHtml } from "../offlinePrint";
import { usePosFloor, usePosMenu } from "../queries";
import { filterMenu, hasOptions, pricedMenu, usePosCart } from "../usePosCart";

type Mode = "tables" | "takeaway";

const NO_MENU: PosMenu = { categories: [], items: [] };
const NO_TABLES: PosTable[] = [];
const NO_TAKEAWAYS: PosOrderSummary[] = [];

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${
        active ? "border-orange-600 bg-orange-600 text-white" : "border-slate-300 bg-white text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

export default function Pos() {
  useStaffTheme();
  const queryClient = useQueryClient();
  const rawMenu = usePosMenu().data ?? NO_MENU;
  const floor = usePosFloor();
  const tables = floor.data?.tables ?? NO_TABLES;
  const takeaways = floor.data?.takeaways ?? NO_TAKEAWAYS;
  const printing = usePrintingStatus().data;
  const cart = usePosCart();
  const { orderId, draft, detail: activeDetail } = cart;
  const [panelOpen, setPanelOpen] = useState(false);
  const billing = rawMenu.billing;
  const online = useOnlineStatus();
  const [forcedOffline, setForcedOffline] = useState<{ at: number; manual: boolean } | null>(null);
  const recovered =
    forcedOffline !== null &&
    !forcedOffline.manual &&
    floor.isSuccess &&
    !floor.isFetching &&
    floor.dataUpdatedAt > forcedOffline.at;
  const forced = forcedOffline !== null && !recovered;
  const offline = forced || !online;
  const offlineSales = useOfflineSales();
  const [offlineSettle, setOfflineSettle] = useState<InvoiceTotals | null>(null);

  const [mode, setMode] = useState<Mode>("tables");
  const [tableId, setTableId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [dishFor, setDishFor] = useState<PosMenuItem | null>(null);
  const [settleOpen, setSettleOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const table = tables.find((t) => t._id === tableId) ?? null;
  const areaId = table?.areaId ?? null;
  const offlineTarget: OfflineTarget | null =
    mode === "takeaway"
      ? { orderType: "takeaway", customerName: customerName.trim() }
      : table
        ? { orderType: "dine-in", tableId: table._id, tableCode: table.code, customerName: customerName.trim() }
        : null;
  const openSale = offlineTarget
    ? (offlineSales.find(
        (s) =>
          s.state === "open" &&
          s.orderType === offlineTarget.orderType &&
          (offlineTarget.orderType === "takeaway" || s.tableId === offlineTarget.tableId)
      ) ?? null)
    : null;
  const offlineFlow = offline || !!openSale;
  const menu = pricedMenu(rawMenu, mode === "takeaway" ? { orderType: "takeaway" } : { orderType: "dine-in", areaId });
  const term = search.trim();
  const visibleItems = filterMenu(menu, search, category);

  function reset(nextMode: Mode) {
    setMode(nextMode);
    setTableId(null);
    cart.open(null);
    setCustomerName("");
    setQuantity("");
    setSettleOpen(false);
  }

  function chooseTable(t: PosTable) {
    setMode("tables");
    setTableId(t._id);
    cart.open(t.orders[0]?._id ?? null);
    setMessage(null);
  }

  function resumeTakeaway(o: PosOrderSummary) {
    setMode("takeaway");
    setTableId(null);
    cart.open(o._id);
    setMessage(null);
  }

  function pick(item: PosMenuItem) {
    const qty = Number(quantity) || 1;
    setQuantity("");
    if (search) setSearch("");
    if (hasOptions(item)) {
      setDishFor(item);
      return;
    }
    cart.addLine(item, qty);
  }

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      if (isOfflineError(err)) {
        setForcedOffline({ at: floor.dataUpdatedAt, manual: false });
        setMessage({
          tone: "error",
          text: "Can't reach the server, so this till is billing offline now. Press the same button again to continue.",
        });
      } else {
        setMessage({ tone: "error", text: extractErrorMessage(err) });
      }
    } finally {
      setBusy(false);
    }
  }

  const afterSync = useCallback(
    (result: { synced: number; failed: number }) => {
      void refreshOrderData(queryClient);
      if (result.synced > 0 || result.failed > 0) {
        setMessage({
          tone: result.failed > 0 ? "error" : "ok",
          text: [
            result.synced > 0 && `${result.synced} offline bill${result.synced === 1 ? "" : "s"} synced`,
            result.failed > 0 && `${result.failed} need${result.failed === 1 ? "s" : ""} attention (see Offline bills)`,
          ]
            .filter(Boolean)
            .join(" · "),
        });
      }
    },
    [queryClient]
  );
  useOfflineSync(!forced, afterSync);

  function offlineKot() {
    if (!offlineTarget) return;
    if (draft.length === 0) {
      setMessage({ tone: "error", text: "Add dishes first. Earlier offline KOTs are already printed." });
      return;
    }
    const lines = toOfflineLines(draft);
    const sale = addToOpenSale(offlineTarget, lines);
    printHtml(kotHtml(sale, lines));
    cart.open(orderId);
    setMessage({ tone: "ok", text: "KOT printed on this device (offline)" });
    if (mode === "tables") reset("tables");
  }

  function offlineFinish(payments: OfflinePayment[]) {
    if (!offlineTarget) return;
    const sale = finishSale(offlineTarget, toOfflineLines(draft), billing, payments);
    setOfflineSettle(null);
    if (!sale) return;
    printHtml(receiptHtml(sale, offlineTotals(sale.lines, sale.orderType, billing), billing));
    setMessage({
      tone: "ok",
      text: payments.length
        ? `Paid offline · ₹${sale.clientTotal.toFixed(2)}. It syncs when the connection is back.`
        : `Bill saved offline · ₹${sale.clientTotal.toFixed(2)}. Settle it from Orders once it syncs.`,
    });
    reset(mode);
    if (!offline) void syncOfflineSales().then(afterSync);
  }

  function offlineSettleOpen() {
    if (!offlineTarget) return;
    const lines = [...(openSale?.lines ?? []), ...toOfflineLines(draft)];
    if (lines.length === 0) return;
    setOfflineSettle(offlineTotals(lines, offlineTarget.orderType, billing));
  }

  const save = (send: boolean) =>
    cart.save(send, {
      orderType: mode === "tables" ? "dine-in" : "takeaway",
      tableId: mode === "tables" ? (tableId ?? undefined) : undefined,
      customerName: customerName.trim() || undefined,
    });

  function saveAndKot() {
    if (offlineFlow) return offlineKot();
    const tab = printing?.printersConfigured ? null : window.open("", "_blank");
    void run(async () => {
      try {
        const { id, kot } = await save(true);
        if (kot && id && tab) await openPdfInTab(tab, () => kitchenApi.kotPdf(id, kot.round));
        else tab?.close();
        if (kot)
          setMessage({
            tone: "ok",
            text: `KOT${kot.tokenNumber ? ` T${kot.tokenNumber}` : ""} sent to the kitchen`,
          });
        if (mode === "tables" && kot) reset("tables");
      } catch (err) {
        tab?.close();
        throw err;
      }
    });
  }

  function hold() {
    void run(async () => {
      await save(false);
      reset("takeaway");
      setMessage({ tone: "ok", text: "Order held. Resume it from Running." });
    });
  }

  function bill() {
    if (offlineFlow) return offlineFinish([]);
    const toPrinter = !!printing?.billPrinterConfigured;
    const tab = toPrinter ? null : window.open("", "_blank");
    void run(async () => {
      try {
        const { id } = await save(true);
        if (!id) return;
        const justBilled = await cart.bill(id);
        if (toPrinter) {
          if (!(justBilled && printing?.autoPrintBill)) await ordersApi.printBill(id);
          setMessage({ tone: "ok", text: "Bill sent to the printer" });
        } else {
          await openPdfInTab(tab, () => ordersApi.invoicePdf(id));
        }
      } catch (err) {
        tab?.close();
        throw err;
      }
    });
  }

  function settle() {
    if (offlineFlow) return offlineSettleOpen();
    void run(async () => {
      const { id } = await save(true);
      if (!id) return;
      await cart.bill(id);
      const fresh = await ordersApi.get(id);
      queryClient.setQueryData(orderKeys.detail(id), fresh);
      setSettleOpen(true);
    });
  }

  async function afterSettle() {
    setSettleOpen(false);
    if (!orderId) return;
    const fresh = await ordersApi.get(orderId);
    if (fresh.order.status !== "closed") return;
    setMessage({
      tone: "ok",
      text: `Paid · ${fresh.order.invoiceNumber ?? fresh.order.customerName}`,
    });
    reset(mode);
  }

  const actions = useRef({ saveAndKot, bill, settle });
  useEffect(() => {
    actions.current = { saveAndKot, bill, settle };
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (settleOpen || dishFor || offlineSettle) return;
      const target = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if (e.key === "F2") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === "F8") {
        e.preventDefault();
        actions.current.saveAndKot();
      } else if (e.key === "F9") {
        e.preventDefault();
        actions.current.bill();
      } else if (e.key === "F10") {
        e.preventDefault();
        actions.current.settle();
      } else if (e.key === "Escape") {
        setSearch("");
        setQuantity("");
      } else if (!typing && /^[0-9]$/.test(e.key)) {
        setQuantity((q) => (q + e.key).replace(/^0+/, "").slice(0, 3));
      } else if (!typing && e.key === "Backspace") {
        setQuantity((q) => q.slice(0, -1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settleOpen, dishFor, offlineSettle]);

  const showTables = mode === "tables" && !tableId;
  const title =
    mode === "tables"
      ? table
        ? `Table ${table.code}`
        : "Choose a table"
      : orderId
        ? `Takeaway · ${activeDetail?.order.customerName ?? ""}`
        : "New takeaway";

  const headerExtra =
    mode === "takeaway" ? (
      <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1" aria-label="Running takeaway orders">
        <Chip active={!orderId} onClick={() => reset("takeaway")}>
          + New
        </Chip>
        {takeaways.map((o) => (
          <Chip key={o._id} active={o._id === orderId} onClick={() => resumeTakeaway(o)}>
            {o.customerName} · ₹{o.total.toFixed(0)}
            {o.unsent > 0 ? " · held" : ""}
          </Chip>
        ))}
      </div>
    ) : table && table.orders.length > 1 ? (
      <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
        {table.orders.map((o) => (
          <Chip key={o._id} active={o._id === orderId} onClick={() => cart.open(o._id)}>
            {o.customerName} · ₹{o.total.toFixed(0)}
          </Chip>
        ))}
      </div>
    ) : null;

  return (
    <div className="flex h-dvh flex-col bg-slate-100">
      <header className="flex shrink-0 items-center gap-2 bg-slate-900 px-3 py-2 text-white">
        <Link
          to="/admin"
          aria-label="Back to admin"
          className="inline-flex min-h-[40px] items-center gap-1 rounded-lg px-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span className="hidden sm:inline">Admin</span>
        </Link>
        <div className="flex rounded-lg bg-slate-800 p-1">
          {(["tables", "takeaway"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => (m === "tables" ? reset("tables") : reset("takeaway"))}
              className={`min-h-[36px] rounded-md px-3 text-sm font-semibold whitespace-nowrap sm:px-4 ${
                mode === m ? "bg-orange-600 text-white" : "text-slate-300 hover:text-white"
              }`}
            >
              {m === "tables" ? "Dine-in" : "Takeaway"}
            </button>
          ))}
        </div>
        {mode === "tables" && tableId && (
          <button
            type="button"
            onClick={() => reset("tables")}
            className="rounded-md bg-slate-800 px-3 py-1.5 text-sm hover:bg-slate-700"
          >
            All tables
          </button>
        )}
        <input
          ref={searchRef}
          id="pos-search"
          type="search"
          autoComplete="off"
          placeholder="Search dish or code  (F2)"
          value={search}
          disabled={showTables}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && visibleItems[0]) {
              e.preventDefault();
              pick(visibleItems[0]);
            }
          }}
          className="ml-auto h-10 w-full min-w-0 flex-1 sm:max-w-xs rounded-lg border-0 bg-white px-3 text-base text-slate-900 placeholder:text-slate-400 focus:ring-4 focus:ring-orange-500/30 focus:outline-none disabled:opacity-40 sm:text-sm"
        />
        <button
          type="button"
          aria-pressed={forced}
          aria-label={forced ? "Go back online" : "Bill offline"}
          title={forced ? "Go back online" : "Bill offline"}
          onClick={() => setForcedOffline(forced ? null : { at: 0, manual: true })}
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
            forced ? "bg-amber-500 text-slate-900" : "text-slate-300 hover:bg-slate-800 hover:text-white"
          }`}
        >
          <CloudOff size={18} aria-hidden="true" />
        </button>
        <ThemeToggleButton className="hidden sm:inline-flex" />
      </header>

      <OfflineBar
        offline={offline}
        forced={forced}
        billing={billing}
        onReconnect={() => setForcedOffline(null)}
        onSynced={() => afterSync({ synced: 0, failed: 0 })}
      />

      {message && (
        <div
          role="status"
          className={`shrink-0 px-4 py-2 text-sm font-medium ${
            message.tone === "ok" ? "bg-green-100 text-green-900" : "bg-red-100 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      <main className="relative flex min-h-0 flex-1">
        <section className="min-w-0 flex-1 pb-20 md:pb-0">
          {showTables ? (
            <TableMap tables={tables} areas={floor.data?.areas} onSelect={chooseTable} />
          ) : (
            <MenuGrid
              categories={menu.categories}
              category={category}
              onCategory={(id) => {
                setCategory(id);
                setSearch("");
              }}
              items={visibleItems}
              searching={!!term}
              quantity={quantity}
              onQuantity={setQuantity}
              onPick={pick}
            />
          )}
        </section>
        <div
          className={`${panelOpen ? "fixed inset-0 z-40 flex flex-col bg-white animate-sheet-up" : "hidden"} md:static md:z-auto md:flex md:animate-none`}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-900 px-3 py-2 text-white md:hidden">
            <span className="text-sm font-semibold">Current order</span>
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              className="inline-flex min-h-[40px] items-center gap-1 rounded-lg px-3 text-sm font-medium text-slate-200 hover:bg-slate-800"
            >
              <ChevronDown size={18} aria-hidden="true" />
              Back to menu
            </button>
          </div>
          <OrderPanel
            className="min-h-0 w-full flex-1 border-l md:w-[340px] md:flex-none lg:w-[390px]"
            title={title}
            emptyText={showTables ? "Tap a table to start or open its order." : undefined}
            headerExtra={
              <>
                {headerExtra}
                {offlineFlow && orderId && (
                  <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                    This table's running order is on the server. Dishes added offline become a separate bill.
                  </p>
                )}
                {!offlineFlow && activeDetail && activeDetail.order.status !== "cancelled" && (
                  <div className="mt-2 border-t border-slate-100 pt-2">
                    <CustomerPanel order={activeDetail.order} compact />
                  </div>
                )}
              </>
            }
            detail={
              offlineFlow
                ? openSale
                  ? {
                      ...offlineDetail(openSale, billing),
                      totals: offlineTotals([...openSale.lines, ...toOfflineLines(draft)], openSale.orderType, billing),
                    }
                  : null
                : activeDetail
            }
            offline={offlineFlow}
            offlineTotal={
              offlineFlow && offlineTarget && (openSale || draft.length > 0)
                ? offlineTotals(
                    [...(openSale?.lines ?? []), ...toOfflineLines(draft)],
                    offlineTarget.orderType,
                    billing
                  ).grandTotal
                : null
            }
            draft={draft}
            customerName={mode === "takeaway" && !orderId ? customerName : null}
            onCustomerName={setCustomerName}
            onDraftQuantity={cart.changeQuantity}
            onDraftRemove={cart.removeLine}
            onSaveKot={saveAndKot}
            onHold={mode === "takeaway" && !offlineFlow ? hold : null}
            onBill={bill}
            onSettle={settle}
            busy={busy || showTables}
          />
        </div>
        {!panelOpen && (
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="fixed inset-x-3 bottom-3 z-30 flex min-h-[56px] items-center justify-between gap-3 rounded-xl bg-slate-900 px-4 text-white shadow-pop md:hidden"
            style={{ marginBottom: "env(safe-area-inset-bottom)" }}
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <ShoppingBasket size={18} aria-hidden="true" />
              {title}
            </span>
            <span className="flex items-center gap-2 text-sm">
              {draft.length > 0 && (
                <span className="rounded-full bg-orange-600 px-2 py-0.5 text-xs font-bold">
                  {draft.reduce((n, l) => n + l.quantity, 0)} new
                </span>
              )}
              View order
              <ChevronUp size={16} aria-hidden="true" />
            </span>
          </button>
        )}
      </main>

      {offlineSettle && (
        <OfflineSettleDialog totals={offlineSettle} onClose={() => setOfflineSettle(null)} onConfirm={offlineFinish} />
      )}

      <DishDialog
        food={dishFor}
        onClose={() => setDishFor(null)}
        onAdd={(food, payload) => {
          const item = menu.items.find((i) => i._id === food._id);
          if (item) cart.addLine(item, payload.quantity, payload.modifiers, payload.note.trim());
          setDishFor(null);
        }}
      />

      {activeDetail && (
        <SettleDialog
          open={settleOpen}
          orderId={activeDetail.order._id}
          total={activeDetail.totals.grandTotal}
          invoiceNumber={activeDetail.order.invoiceNumber}
          upi={activeDetail.payment}
          onClose={() => void afterSettle()}
        />
      )}
    </div>
  );
}
