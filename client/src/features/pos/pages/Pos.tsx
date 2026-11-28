import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, ChevronUp, CloudOff, Keyboard, ShoppingBasket, Wallet } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import DishDialog from "../../../components/DishDialog";
import type { InvoiceTotals, OrderItem, PosMenu, PosMenuItem, PosOrderSummary, PosTable } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { confirmDialog } from "../../../shared/ui/confirm";
import { ITEM_CANCEL_REASON_LABELS, type ItemCancelReason } from "../../../lib/types";
import { useStaffTheme } from "../../../shared/theme";
import { StaffSignOut } from "../../../components/StaffSignOut";
import { can, useAdmin } from "../../../lib/adminAuth";
import { useTodayShifts } from "../../shifts/queries";
import { CashDrawerDialog } from "../components/CashDrawerDialog";
import { ShortcutsDialog } from "../components/ShortcutsDialog";
import ReasonDialog from "../../../shared/ui/ReasonDialog";
import { ThemeToggleButton } from "../../../shared/ui/ThemeToggle";
import { CustomerPanel } from "../../customers/components/CustomerPanel";
import { kitchenApi, openPdfInTab } from "../../kitchen/api";
import { ordersApi } from "../../orders/api";
import SettleDialog from "../../orders/components/SettleDialog";
import { orderKeys, refreshOrderData, useCancelOrder, useCancelOrderItem, useComplimentary, useSetItemPacked } from "../../orders/queries";
import { useServeItem } from "../../kitchen/queries";
import { usePrintingStatus } from "../../printing/queries";
import { MenuGrid } from "../components/MenuGrid";
import { OfflineBar } from "../components/OfflineBar";
import { OfflineSettleDialog } from "../components/OfflineSettleDialog";
import { OrderPanel } from "../components/OrderPanel";
import { useResizablePanel } from "../useResizablePanel";
import { CashierBoard } from "../components/CashierBoard";
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
import { posKeys, usePosFloor, usePosMenu, usePosToday, useReleasePosTable } from "../queries";
import { filterMenu, hasOptions, pricedMenu, usePosCart } from "../usePosCart";
import { posApi, type DraftLine } from "../api";
import { usePrintSlips } from "../usePrintSlips";

type Mode = "tables" | "takeaway" | "cashier";

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

const ITEM_CANCEL_OPTIONS = (Object.keys(ITEM_CANCEL_REASON_LABELS) as ItemCancelReason[]).map((value) => ({
  value,
  label: ITEM_CANCEL_REASON_LABELS[value],
}));

export default function Pos() {
  useStaffTheme();
  const { profile } = useAdmin();
  // Cash drawer for the day: shown to logins with the Day close / Cash shifts page.
  const cashAccess = can(profile, "dayClose");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // The new dish staff are about to make complimentary: a reason is asked for first.
  const [freeFor, setFreeFor] = useState<DraftLine | null>(null);
  const todayShifts = useTodayShifts(cashAccess);
  const shiftOpen = (todayShifts.data ?? []).some((s) => s.isOpen);
  const queryClient = useQueryClient();
  const rawMenu = usePosMenu().data ?? NO_MENU;
  const floor = usePosFloor();
  const tables = floor.data?.tables ?? NO_TABLES;
  const takeaways = floor.data?.takeaways ?? NO_TAKEAWAYS;
  const printing = usePrintingStatus().data;
  const cart = usePosCart();
  const { orderId, draft, detail: activeDetail } = cart;
  const [panelOpen, setPanelOpen] = useState(false);
  const panel = useResizablePanel();
  const billing = rawMenu.billing;
  // Cafe flow: pay first, and the kitchen gets the order the moment it is paid.
  const cafe = billing?.serviceFlow === "cafe";
  // Tables switched off in Settings: no table map, every order starts without a table (the "takeaway" mode below).
  const tablesOff = billing?.useTables === false;
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
  useEffect(() => {
    if (tablesOff) setMode((m) => (m === "tables" ? "takeaway" : m));
  }, [tablesOff]);
  // A line already in the order being changed in the dish dialog (null when adding a new dish).
  const [editLine, setEditLine] = useState<DraftLine | null>(null);
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
          (offlineTarget.orderType === "takeaway" || s.tableId === offlineTarget.tableId),
      ) ?? null)
    : null;
  const offlineFlow = offline || !!openSale;
  // Dine-in guests who pay when ordering: payment, not a KOT, sends the order to the kitchen.
  // Kiosk orders left to pay at the counter work the same way.
  const payFirst =
    !offlineFlow &&
    (activeDetail?.order.source === "kiosk" ||
      (billing?.dineInPayment === "upfront" &&
        (activeDetail ? activeDetail.order.orderType === "dine-in" : tablesOff ? mode === "takeaway" : !!tableId && mode !== "takeaway")) ||
      (!!billing?.takeawayPayFirst &&
        (activeDetail ? activeDetail.order.orderType !== "dine-in" : mode === "takeaway" && !tablesOff)));
  const releaseTable = useReleasePosTable();
  const setPacked = useSetItemPacked();
  const cancelItem = useCancelOrderItem();
  const cancelOrder = useCancelOrder();
  // An order whose dishes already went to the kitchen is cancelled with a reason.
  const [cancellingSent, setCancellingSent] = useState<string | null>(null);
  // One dish the kitchen already has, cancelled with a reason.
  const [cancellingItem, setCancellingItem] = useState<OrderItem | null>(null);
  // One plate of a saved dish made complimentary (after the KOT too), with a reason.
  const [freeingItem, setFreeingItem] = useState<OrderItem | null>(null);
  const makeComplimentary = useComplimentary();
  const slips = usePrintSlips(printing);
  const todayQuery = usePosToday(mode === "cashier");
  // The order that was just paid, so its invoice can be printed or sent before the screen moves on to the next order.
  const [justPaid, setJustPaid] = useState<{ id: string; label: string; hasPhone: boolean } | null>(null);
  const [slipBusyId, setSlipBusyId] = useState<string | null>(null);

  // Another order or table picked, or a new one started: the paid footer is done with.
  useEffect(() => {
    if (justPaid && orderId !== justPaid.id) setJustPaid(null);
  }, [orderId, justPaid]);

  /** Print the invoice, or the KOT and the invoice as two slips. Called straight from a click (a PDF tab needs that). */
  function printSlip(kind: "invoice" | "both", id: string) {
    setSlipBusyId(id);
    setMessage(null);
    const job = kind === "invoice" ? slips.printInvoice(id) : slips.printBoth(id);
    job
      .then((text) => {
        setMessage({ tone: "ok", text });
        void queryClient.invalidateQueries({ queryKey: posKeys.today });
        // The order's own "printed" flag changed too: the panel hides Print invoice once it was printed.
        void refreshOrderData(queryClient);
      })
      .catch((err) => setMessage({ tone: "error", text: extractErrorMessage(err) }))
      .finally(() => setSlipBusyId(null));
  }
  const serveDish = useServeItem();
  const menu = pricedMenu(rawMenu, mode === "takeaway" && !tablesOff ? { orderType: "takeaway" } : { orderType: "dine-in", areaId });
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

  // Cashier mode keeps its own mode: pick an active table (or takeaway) to see and bill its order.
  function cashierTable(t: PosTable) {
    setTableId(t._id);
    cart.open(t.orders[0]?._id ?? null);
    setMessage(null);
    setPanelOpen(true);
  }

  /** Opens any order (picked from the day's list, a takeaway or a bill left to pay) in the panel to bill or settle it. */
  function cashierOrder(id: string) {
    setTableId(null);
    cart.open(id);
    setMessage(null);
    setPanelOpen(true);
  }

  function cashierTakeaway(o: PosOrderSummary) {
    cashierOrder(o._id);
  }

  function addDishesToSelected() {
    if (tableId) setMode("tables");
    else setMode("takeaway");
    setPanelOpen(false);
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
    [queryClient],
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
      // With tables off, "takeaway" mode places a dine-in order without a table (counter service).
      orderType: mode === "tables" || tablesOff ? "dine-in" : "takeaway",
      tableId: mode === "tables" ? (tableId ?? undefined) : undefined,
      customerName: customerName.trim() || undefined,
    });

  function saveAndKot() {
    if (offlineFlow) return offlineKot();
    if (cafe) {
      setMessage({
        tone: "error",
        text: "Cafe flow: the kitchen gets the order when it is paid. Use Pay & send KOT (F10).",
      });
      return;
    }
    if (payFirst) return settle();
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

  /** Takes a saved line the kitchen has not got yet off the order (a held takeaway, a bill left to pay). */
  async function removeSaved(item: OrderItem) {
    const ok = await confirmDialog({
      title: `Remove ${item.foodName}?`,
      message: "It was never sent to the kitchen, so it is simply taken off the order.",
      confirmLabel: "Remove",
    });
    if (!ok) return;
    void run(async () => {
      await cancelItem.mutateAsync({ itemId: item._id });
    });
  }

  /** An order with no dishes left (everything removed, or opened and never filled): cancel it after a confirmation. */
  async function cancelEmptyOrder(id: string, label: string) {
    const ok = await confirmDialog({
      title: "Cancel this empty order?",
      message: `${label} has no dishes. It is removed from the counter.`,
      confirmLabel: "Cancel order",
      cancelLabel: "Keep it",
    });
    if (!ok) return;
    void run(async () => {
      await cancelOrder.mutateAsync({ orderId: id });
      setMessage({ tone: "ok", text: "Empty order cancelled" });
      if (orderId === id) {
        setTableId(null);
        cart.open(null);
      }
    });
  }

  function release() {
    if (!table) return;
    const code = table.code;
    void run(async () => {
      await releaseTable.mutateAsync(table._id);
      setMessage({ tone: "ok", text: `Table ${code} is free` });
      reset("tables");
    });
  }

  function hold() {
    const code = table?.code;
    void run(async () => {
      await save(false);
      reset(mode);
      setMessage({
        tone: "ok",
        text: cafe
          ? "Order held. Find it again under Cashier and take payment to send it to the kitchen."
          : mode === "takeaway"
            ? "Order held. Resume it from Running."
            : `Order held on table ${code}. It goes to the kitchen once paid.`,
      });
    });
  }

  function bill() {
    if (offlineFlow) return offlineFinish([]);
    const toPrinter = !!printing?.billPrinterConfigured;
    const tab = toPrinter ? null : window.open("", "_blank");
    void run(async () => {
      try {
        const { id } = await save(!payFirst && !cafe);
        if (!id) return;
        const justBilled = await cart.bill(id);
        if (toPrinter) {
          if (!(justBilled && printing?.autoPrintBill)) await ordersApi.printBill(id);
          setMessage({ tone: "ok", text: "Bill sent to the printer" });
        } else {
          await openPdfInTab(tab, () => ordersApi.invoicePdf(id));
          // Opened to print from the browser: the cashier's list counts it as printed.
          await posApi.invoicePrinted(id).catch(() => undefined);
        }
      } catch (err) {
        tab?.close();
        throw err;
      }
    });
  }

  /** Send what is unsent to the kitchen, make the bill, then print the KOT and the invoice as two separate slips. */
  function billAndPrintBoth() {
    if (offlineFlow) return offlineFinish([]);
    // Without a printer the two slips open as PDF tabs, which a browser only allows straight from the click.
    const toPrinter = !!printing?.printersConfigured;
    const tabs: [Window | null, Window | null] = toPrinter
      ? [null, null]
      : [window.open("", "_blank"), window.open("", "_blank")];
    void run(async () => {
      try {
        const { id } = await save(!payFirst && !cafe);
        if (!id) {
          tabs.forEach((tab) => tab?.close());
          return;
        }
        await cart.bill(id);
        setMessage({ tone: "ok", text: await slips.printBoth(id, tabs) });
        void queryClient.invalidateQueries({ queryKey: posKeys.today });
      } catch (err) {
        tabs.forEach((tab) => tab?.close());
        throw err;
      }
    });
  }

  // Set by the "KOT + invoice" payment button: once the payment is taken, print the KOT and the invoice as two slips.
  const printBothAfterPay = useRef(false);

  function settle(withSlips: boolean = false) {
    // Called as a click handler too, so only a real `true` counts.
    printBothAfterPay.current = withSlips === true;
    if (offlineFlow) return offlineSettleOpen();
    if (settleBlock) {
      setMessage({ tone: "error", text: "Serve every dish before settling this bill." });
      return;
    }
    void run(async () => {
      // Cafe flow: save the order without a KOT. Paying it is what sends it to the kitchen.
      const { id } = await save(!payFirst && !cafe);
      if (!id) return;
      // Paying first: the order stays open (and can still change) until the payment bills it.
      if (!payFirst) await cart.bill(id);
      const fresh = await ordersApi.get(id);
      queryClient.setQueryData(orderKeys.detail(id), fresh);
      setSettleOpen(true);
    });
  }

  /**
   * Paying after eating, a dine-in bill is only settled once every dish is served, so a table never pays while food
   * is still on its way. Dishes not sent to the kitchen yet have to be sent first; sent ones can be marked served here.
   */
  const draftCount = cart.draft.length;
  const dishes = activeDetail?.items.filter((i) => i.status !== "cancelled") ?? [];
  const unsentDishes = dishes.filter((i) => i.kotRound == null).length + draftCount;
  const unservedDishes = dishes.filter((i) => i.status !== "served" && i.kotRound != null);
  const settleBlock =
    !payFirst &&
    !cafe &&
    !offlineFlow &&
    activeDetail?.order.orderType === "dine-in" &&
    (activeDetail.order.status === "open" || activeDetail.order.status === "billed") &&
    unservedDishes.length + unsentDishes > 0
      ? {
          waiting: unservedDishes.length + unsentDishes,
          unsent: unsentDishes,
          onServeAll:
            unservedDishes.length > 0
              ? () =>
                  void run(async () => {
                    for (const dish of unservedDishes) await serveDish.mutateAsync(dish._id);
                  })
              : null,
        }
      : null;

  async function afterSettle() {
    setSettleOpen(false);
    const wantSlips = printBothAfterPay.current;
    printBothAfterPay.current = false;
    if (!orderId) return;
    const fresh = await ordersApi.get(orderId);
    if (fresh.order.status !== "closed") return;
    const tokens = [
      ...new Set(
        fresh.items.filter((i) => i.status !== "cancelled" && i.tokenNumber != null).map((i) => i.tokenNumber),
      ),
    ];
    const sent =
      (cafe || (fresh.order.orderType === "dine-in" && fresh.dineInPayment === "upfront")) && tokens.length > 0;
    setMessage({
      tone: "ok",
      text: `Paid · ${fresh.order.invoiceNumber ?? fresh.order.customerName}${
        sent ? ` · sent to the kitchen as token T${tokens.join(", T")}` : ""
      }`,
    });
    setJustPaid({
      id: orderId,
      label: fresh.order.invoiceNumber ?? fresh.order.customerName,
      hasPhone: !!fresh.order.customerPhone?.replace(/\D/g, ""),
    });
    // The panel stays on the paid order, with its invoice buttons in the footer, until "New order" or another pick.
    if (wantSlips) {
      // A printer can be used from here; opening PDF tabs needs a click, so without one the footer button does it.
      if (printing?.printersConfigured) printSlip("both", orderId);
      else setMessage((m) => (m ? { ...m, text: `${m.text} · press KOT + invoice below to print the two slips` } : m));
    }
  }

  const actions = useRef({ saveAndKot, bill, settle, hold, both: billAndPrintBoth, go: reset, cash: cashAccess, tables: !tablesOff });
  useEffect(() => {
    actions.current = { saveAndKot, bill, settle, hold, both: billAndPrintBoth, go: reset, cash: cashAccess, tables: !tablesOff };
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (settleOpen || dishFor || offlineSettle || drawerOpen || shortcutsOpen || freeFor) return;
      const target = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        // Alt + key: jump around and run the order actions. e.code is used so it works with any keyboard layout.
        const a = actions.current;
        const keys: Record<string, (() => void) | null> = {
          Digit1: a.tables ? () => a.go("tables") : null,
          Digit2: () => a.go("takeaway"),
          Digit3: () => a.go("cashier"),
          KeyC: a.cash ? () => setDrawerOpen(true) : null,
          KeyH: () => a.hold(),
          KeyK: () => a.both(),
        };
        const action = keys[e.code];
        if (action) {
          e.preventDefault();
          action();
        }
      } else if (e.key === "F1" || (!typing && e.key === "?")) {
        e.preventDefault();
        setShortcutsOpen(true);
      } else if (e.key === "F2") {
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
  }, [settleOpen, dishFor, offlineSettle, drawerOpen, shortcutsOpen, freeFor]);

  const showTables = mode === "tables" && !tableId;
  // On a table's order the top-left Back returns to the table map (asking first when dishes were added but not saved).
  const insideTable = mode === "tables" && !!tableId;
  async function backToTables() {
    if (
      cart.draft.length > 0 &&
      !(await confirmDialog({
        title: "Leave this table?",
        message: "The dishes you added and haven't saved will be discarded.",
        confirmLabel: "Discard and go back",
      }))
    )
      return;
    reset("tables");
  }
  const cashier = mode === "cashier";
  // A picked order shows where it sits: its table, or takeaway / counter order.
  const pickedOrder = activeDetail?.order;
  const pickedTable = pickedOrder && typeof pickedOrder.tableId === "object" && pickedOrder.tableId ? pickedOrder.tableId.code : null;
  const pickedTitle = `${pickedTable ? `Table ${pickedTable}` : pickedOrder?.orderType === "dine-in" ? "Order" : "Takeaway"} · ${pickedOrder?.customerName ?? ""}`;
  const title =
    mode === "tables" || cashier
      ? table
        ? `Table ${table.code}`
        : cashier
          ? orderId
            ? pickedTitle
            : "Pick a table or an order to bill"
          : "Choose a table"
      : orderId
        ? `${tablesOff ? "Order" : "Takeaway"} · ${activeDetail?.order.customerName ?? ""}`
        : tablesOff
          ? "New order"
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
            {o.unsent > 0 ? (o.source === "kiosk" ? " · to pay" : " · held") : ""}
          </Chip>
        ))}
      </div>
    ) : table && !table.isGuest && table.status !== "available" && table.orders.length === 0 && !offlineFlow ? (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span>Seated, nothing to pay.</span>
        <button
          type="button"
          onClick={release}
          disabled={busy}
          className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
        >
          Release table
        </button>
      </div>
    ) : table && (table.orders.length > 1 || table.isGuest) ? (
      <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
        {table.isGuest && (
          <Chip active={!orderId} onClick={() => cart.open(null)}>
            + New order
          </Chip>
        )}
        {table.orders.map((o) => (
          <Chip key={o._id} active={o._id === orderId} onClick={() => cart.open(o._id)}>
            {o.customerName} · ₹{o.total.toFixed(0)}
          </Chip>
        ))}
      </div>
    ) : null;

  return (
    <div className="flex h-dvh max-w-full flex-col overflow-x-hidden bg-slate-100">
      <header className="flex shrink-0 flex-wrap items-center gap-2 bg-slate-900 px-3 py-2 text-white">
        {insideTable ? (
          <button
            type="button"
            aria-label="Back to the tables"
            onClick={() => void backToTables()}
            className="inline-flex min-h-[40px] items-center gap-1 rounded-lg bg-slate-800 px-3 text-sm font-medium text-white hover:bg-slate-700"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Tables
          </button>
        ) : (
          can(profile, "dashboard") && (
            <Link
              to="/admin"
              aria-label="Back to admin"
              className="inline-flex min-h-[40px] items-center gap-1 rounded-lg bg-slate-800 px-3 text-sm font-medium text-slate-200 hover:bg-slate-700 hover:text-white"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Admin
            </Link>
          )
        )}
        <div className="flex rounded-lg bg-slate-800 p-1">
          {(tablesOff ? (["takeaway", "cashier"] as const) : (["tables", "takeaway", "cashier"] as const)).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => reset(m)}
              className={`min-h-[36px] rounded-md px-2.5 text-sm font-semibold whitespace-nowrap sm:px-4 ${
                mode === m ? "bg-orange-600 text-white" : "text-slate-300 hover:text-white"
              }`}
            >
              {m === "tables" ? "Dine-in" : m === "takeaway" ? (tablesOff ? "New order" : "Takeaway") : "Cashier"}
            </button>
          ))}
        </div>
        <input
          ref={searchRef}
          id="pos-search"
          type="search"
          autoComplete="off"
          placeholder={showTables ? "Open a table to search dishes" : cashier ? "Search is for adding dishes" : "Search dish or code  (F2)"}
          value={search}
          disabled={showTables || cashier}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && visibleItems[0]) {
              e.preventDefault();
              pick(visibleItems[0]);
            }
          }}
          className="order-last h-10 w-full basis-full min-w-0 sm:order-none sm:ml-auto sm:basis-auto sm:flex-1 sm:max-w-xs rounded-lg border-0 bg-white px-3 text-base text-slate-900 placeholder:text-slate-400 focus:ring-4 focus:ring-orange-500/30 focus:outline-none disabled:opacity-40 sm:text-sm"
        />
        <button
          type="button"
          aria-pressed={forced}
          aria-label={forced ? "Go back online" : "Bill offline"}
          title={forced ? "Go back online" : "Bill offline"}
          onClick={() => setForcedOffline(forced ? null : { at: 0, manual: true })}
          className={`ml-auto inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors sm:ml-0 ${
            forced ? "bg-amber-500 text-slate-900" : "text-slate-300 hover:bg-slate-800 hover:text-white"
          }`}
        >
          <CloudOff size={18} aria-hidden="true" />
        </button>
        {cashAccess && (
          <button
            type="button"
            aria-label="Cash drawer"
            title={shiftOpen ? "Cash drawer" : "No shift is open: open one to track today's cash"}
            onClick={() => setDrawerOpen(true)}
            className="relative inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-slate-800 px-3 text-sm font-medium text-slate-200 hover:bg-slate-700 hover:text-white"
          >
            <Wallet size={16} aria-hidden="true" />
            <span className="hidden sm:inline">Cash</span>
            {todayShifts.isSuccess && !shiftOpen && (
              <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber-400" />
            )}
          </button>
        )}
        <button
          type="button"
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (F1)"
          onClick={() => setShortcutsOpen(true)}
          className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white lg:inline-flex"
        >
          <Keyboard size={18} aria-hidden="true" />
        </button>
        <ThemeToggleButton className="hidden sm:inline-flex" />
        <StaffSignOut to="/pos/login" />
      </header>

      <ReasonDialog
        open={freeFor !== null}
        title={`Make ${freeFor?.item.name ?? "this dish"} complimentary?`}
        description={`One plate is complimentary${(freeFor?.quantity ?? 1) > 1 ? " and the rest are charged" : ""}. The reason is kept with the order.`}
        confirmLabel="Make complimentary"
        onCancel={() => setFreeFor(null)}
        onConfirm={async ({ note }) => {
          if (freeFor) cart.toggleComplimentary(freeFor.key, note);
          setFreeFor(null);
        }}
      />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <CashDrawerDialog open={drawerOpen} onClose={() => setDrawerOpen(false)} canEdit={can(profile, "dayClose", "edit")} />

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
          {cashier ? (
            <CashierBoard
              tables={tables}
              takeaways={takeaways}
              tableId={tableId}
              orderId={orderId}
              onSelectTable={cashierTable}
              onSelectTakeaway={cashierTakeaway}
              onAddDishes={resumeTakeaway}
              today={todayQuery.data}
              selectedOrderId={!tableId ? orderId : null}
              onSelectToday={(o) => cashierOrder(o._id)}
              onCancelEmpty={(o) => void cancelEmptyOrder(o._id, o.customerName || "This order")}
              payFirst={billing?.dineInPayment === "upfront"}
              cafe={cafe}
            />
          ) : showTables ? (
            <TableMap tables={tables} areas={floor.data?.areas} onSelect={chooseTable} cafe={cafe} />
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
              onCustomize={setDishFor}
            />
          )}
        </section>
        <div
          {...panel.handleProps}
          className="hidden w-1.5 shrink-0 cursor-col-resize bg-slate-200 transition-colors hover:bg-orange-400 focus-visible:bg-orange-500 focus-visible:outline-none md:block"
        />
        <div
          style={{ "--pos-panel": `${panel.width}px` } as React.CSSProperties}
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
              {cashier ? "Back to tables" : "Back to menu"}
            </button>
          </div>
          <OrderPanel
            className="min-h-0 w-full flex-1 border-l md:w-[var(--pos-panel)] md:flex-none"
            title={title}
            emptyText={
              cashier
                ? "Pick a table or an order on the left to see it and bill it."
                : showTables
                  ? "Tap a table to start or open its order."
                  : undefined
            }
            headerExtra={
              <>
                {headerExtra}
                {cashier && orderId && (
                  <button
                    type="button"
                    onClick={addDishesToSelected}
                    className="mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    + Add dishes to this order
                  </button>
                )}
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
                    billing,
                  ).grandTotal
                : null
            }
            draft={draft}
            customerName={mode === "takeaway" && !orderId ? customerName : null}
            onCustomerName={setCustomerName}
            onDraftQuantity={cart.changeQuantity}
            onDraftRemove={cart.removeLine}
            onDraftComplimentary={(line) => (line.complimentary ? cart.toggleComplimentary(line.key) : setFreeFor(line))}
              onDraftEdit={(line) => {
                setEditLine(line);
                setDishFor(line.item);
              }}
            onCancelItem={(item) => void removeSaved(item)}
            onBillBoth={billAndPrintBoth}
            onSettleBoth={() => settle(true)}
            onPrintInvoice={() => orderId && printSlip("invoice", orderId)}
            paid={
              justPaid && orderId === justPaid.id
                ? {
                    onPrintInvoice: () => printSlip("invoice", justPaid.id),
                    onPrintBoth: () => printSlip("both", justPaid.id),
                    onNext: () => {
                      setJustPaid(null);
                      reset(mode);
                    },
                  }
                : null
            }
            onCancelSent={() => orderId && setCancellingSent(orderId)}
            onCancelSentItem={(item) => setCancellingItem(item)}
            onSavedComplimentary={(item) => setFreeingItem(item)}
            onCancelOrder={() => orderId && void cancelEmptyOrder(orderId, activeDetail?.order.customerName || "This order")}
            onTogglePacked={(item) =>
              void run(async () => {
                await setPacked.mutateAsync({ itemId: item._id, packed: !item.isPacked });
              })
            }
            onSaveKot={saveAndKot}
            onHold={(mode === "takeaway" || payFirst || cafe) && !offlineFlow ? hold : null}
            payFirst={payFirst}
            cafe={cafe}
            onBill={bill}
            onSettle={settle}
            settleBlock={settleBlock}
            busy={busy || slipBusyId !== null || showTables || (cashier && !orderId)}
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
        allowPack
        food={dishFor}
        initial={
          editLine
            ? {
                quantity: editLine.quantity,
                note: editLine.note,
                modifiers: editLine.modifiers,
                isJain: !!editLine.isJain,
                isPacked: editLine.isPacked,
              }
            : undefined
        }
        submitLabel={editLine ? "Update" : "Add"}
        onClose={() => {
          setDishFor(null);
          setEditLine(null);
        }}
        onAdd={(food, payload) => {
          const item = menu.items.find((i) => i._id === food._id);
          if (item && editLine) {
            cart.updateLine(
              editLine.key,
              payload.quantity,
              payload.modifiers,
              payload.note.trim(),
              payload.isJain,
              payload.isPacked
            );
            setEditLine(null);
          } else if (item) cart.addLine(
              item,
              payload.quantity,
              payload.modifiers,
              payload.note.trim(),
              payload.isJain,
              payload.isPacked,
            );
          setDishFor(null);
        }}
      />

      <ReasonDialog
        open={freeingItem !== null}
        title={freeingItem ? `Make 1 ${freeingItem.foodName} complimentary?` : ""}
        description="One plate is not charged. The kitchen ticket is not changed, and the reason is kept for the reports."
        confirmLabel="Make complimentary"
        onCancel={() => setFreeingItem(null)}
        onConfirm={async ({ note }) => {
          await makeComplimentary.mutateAsync({ itemId: freeingItem!._id, reason: note });
          setFreeingItem(null);
          setMessage({ tone: "ok", text: "Marked complimentary" });
        }}
      />

      <ReasonDialog
        open={cancellingItem !== null}
        title={cancellingItem ? `Cancel ${cancellingItem.foodName}?` : ""}
        description="The kitchen already has this dish. It comes off the bill, and what was cooked is written off."
        confirmLabel="Cancel dish"
        danger
        options={ITEM_CANCEL_OPTIONS}
        onCancel={() => setCancellingItem(null)}
        onConfirm={async ({ option, note }) => {
          await cancelItem.mutateAsync({ itemId: cancellingItem!._id, reason: option, note: note || undefined });
          setCancellingItem(null);
          setMessage({ tone: "ok", text: "Dish cancelled" });
        }}
      />

      <ReasonDialog
        open={cancellingSent !== null}
        title="Cancel this order?"
        description="The kitchen has already got it. The order is cancelled, dishes already cooking are written off, and the reason is kept."
        confirmLabel="Cancel order"
        danger
        onCancel={() => setCancellingSent(null)}
        onConfirm={async ({ note }) => {
          const id = cancellingSent!;
          await cancelOrder.mutateAsync({ orderId: id, reason: note });
          setCancellingSent(null);
          setMessage({ tone: "ok", text: "Order cancelled" });
          if (orderId === id) {
            setTableId(null);
            cart.open(null);
          }
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
