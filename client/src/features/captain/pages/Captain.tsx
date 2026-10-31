import {
  ArrowLeft,
  ClipboardList,
  HandPlatter,
  LayoutGrid,
  MessagesSquare,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import DishDialog from "../../../components/DishDialog";
import { can, useAdmin } from "../../../lib/adminAuth";
import { useDineInPayment } from "../../../lib/useDineInPayment";
import type {
  ChatConversation,
  KotQueueGroup,
  PosMenu,
  PosMenuItem,
  PosOrderSummary,
  PosTable,
} from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { POLL } from "../../../shared/api/queryClient";
import { useStaffTheme } from "../../../shared/theme";
import { StaffSignOut } from "../../../components/StaffSignOut";
import { confirmDialog } from "../../../shared/ui/confirm";
import { ThemeToggleButton } from "../../../shared/ui/ThemeToggle";
import { useConversations } from "../../chat/queries";
import { useKotQueue } from "../../kitchen/queries";
import SettleDialog from "../../orders/components/SettleDialog";
import { newId } from "../../../lib/id";
import { ordersApi } from "../../orders/api";
import { orderKeys } from "../../orders/queries";
import { draftUnitPrice } from "../../pos/api";
import { MenuGrid } from "../../pos/components/MenuGrid";
import { OrderPanel } from "../../pos/components/OrderPanel";
import { TableMap } from "../../pos/components/TableMap";
import { usePosFloor, usePosMenu, useReleasePosTable } from "../../pos/queries";
import {
  filterMenu,
  hasOptions,
  pricedMenu,
  usePosCart,
} from "../../pos/usePosCart";
import { usePrintingStatus } from "../../printing/queries";
import { MessageToasts } from "../components/MessageToasts";
import { ReadyList } from "../components/ReadyList";
import { RequestFeed } from "../components/RequestFeed";
import { tableCode } from "../tableCode";

type Tab = "tables" | "orders" | "ready" | "requests";

const NO_MENU: PosMenu = { categories: [], items: [] };
const NO_WALKINS: PosOrderSummary[] = [];
const NO_TABLES: PosTable[] = [];
const NO_GROUPS: KotQueueGroup[] = [];
const NO_CONVERSATIONS: ChatConversation[] = [];
const GUEST_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8];

function useCaptainManifest() {
  useEffect(() => {
    const added: HTMLElement[] = [];
    const add = (tag: string, attrs: Record<string, string>) => {
      const el = document.createElement(tag);
      for (const [key, value] of Object.entries(attrs))
        el.setAttribute(key, value);
      document.head.appendChild(el);
      added.push(el);
    };
    add("link", { rel: "manifest", href: "/captain.webmanifest" });
    add("link", { rel: "apple-touch-icon", href: "/captain-192.png" });
    add("meta", { name: "theme-color", content: "#0f172a" });
    add("meta", { name: "apple-mobile-web-app-capable", content: "yes" });
    return () => added.forEach((el) => el.remove());
  }, []);
}

function TabButton({
  active,
  onClick,
  label,
  count,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  icon: LucideIcon;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`relative flex h-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-semibold ${
        active ? "text-orange-700" : "text-slate-500"
      }`}
    >
      <span
        className={`flex h-7 w-14 items-center justify-center rounded-full ${active ? "bg-orange-100" : ""}`}
      >
        <Icon size={20} aria-hidden="true" />
      </span>
      {label}
      {count > 0 && (
        <span className="absolute top-1.5 right-[calc(50%-2.25rem)] flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white ring-2 ring-white">
          {count}
        </span>
      )}
    </button>
  );
}

function NoTabAccess({ page }: { page: string }) {
  return (
    <p className="px-6 py-12 text-center text-sm text-slate-500">
      This login can't open this tab yet. Ask the owner to give it access to{" "}
      {page} under Admin Users.
    </p>
  );
}

export default function Captain() {
  const dineInPayment = useDineInPayment();
  return dineInPayment === "upfront" ? (
    <NotUsedWhenPayingFirst />
  ) : (
    <CaptainApp />
  );
}

function NotUsedWhenPayingFirst() {
  useStaffTheme();
  return (
    <div className="flex h-dvh flex-col bg-slate-100">
      <header className="flex shrink-0 items-center gap-3 bg-slate-900 px-3 py-2.5 text-white">
        <span className="flex flex-1 items-center gap-2 text-base font-bold">
          <Smartphone
            size={18}
            className="text-orange-400"
            aria-hidden="true"
          />
          Captain
        </span>
        <StaffSignOut to="/captain/login" />
      </header>
      <p className="mx-auto max-w-sm px-6 py-16 text-center text-sm text-slate-600">
        The captain app isn't used here: guests pay when they order, at the
        counter or from their phone. The owner can change this under Settings →
        Billing.
      </p>
    </div>
  );
}

/** Stands in for a table id while the captain works on an order that has no table. */
const WALKIN = "__walkin__";
const newWalkInRef = () =>
  `W-${newId()
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 4)
    .toUpperCase()}`;
const walkInRefOf = (name: string) => name.match(/W-[A-Z0-9]{4}$/)?.[0] ?? name;

function CaptainApp() {
  useStaffTheme();
  useCaptainManifest();
  const { profile } = useAdmin();
  const rawMenu = usePosMenu().data ?? NO_MENU;
  // Cafe flow: guests pay at the counter first, so there is no bill to request and the kitchen waits for payment.
  const cafe = rawMenu.billing?.serviceFlow === "cafe";
  const floor = usePosFloor().data;
  const releasePosTable = useReleasePosTable();
  const tables = floor?.tables ?? NO_TABLES;
  const printing = usePrintingStatus().data;
  const canKitchen = can(profile, "kot");
  const canMessages = can(profile, "messages");
  const queue = useKotQueue(undefined, undefined, canKitchen);
  const groups = canKitchen ? (queue.data ?? NO_GROUPS) : NO_GROUPS;
  const conversationsQuery = useConversations(POLL.conversations, canMessages);
  const conversations = canMessages
    ? (conversationsQuery.data ?? NO_CONVERSATIONS)
    : NO_CONVERSATIONS;
  const cart = usePosCart();

  const [tab, setTab] = useState<Tab>("tables");
  const [mineOnly, setMineOnly] = useState(true);
  const [tableId, setTableId] = useState<string | null>(null);
  const [guests, setGuests] = useState(2);
  // An order without a table is told apart by its own id, which is also its customer name on the order.
  const [walkRef, setWalkRef] = useState(newWalkInRef);
  const [askGuests, setAskGuests] = useState<PosTable | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [dishFor, setDishFor] = useState<PosMenuItem | null>(null);
  const [settleOpen, setSettleOpen] = useState(false);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);

  const hasAssigned = tables.some((t) => t.captainId === profile?.id);
  const myTables =
    hasAssigned && mineOnly
      ? tables.filter((t) => t.captainId === profile?.id)
      : tables;
  const myCodes = new Set(myTables.map((t) => t.code));
  const myGroups =
    hasAssigned && mineOnly
      ? groups.filter((g) => myCodes.has(tableCode(g.order) ?? ""))
      : groups;
  const readyCount = myGroups.reduce(
    (sum, g) => sum + g.items.filter((i) => i.status === "ready").length,
    0,
  );
  const unread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
  const table = tables.find((t) => t._id === tableId) ?? null;
  const isWalkIn = tableId === WALKIN;
  const placeLabel = isWalkIn ? `Order ${walkRef}` : `Table ${table?.code}`;
  const walkIns = floor?.takeaways ?? NO_WALKINS;
  const areaId = table?.areaId ?? null;
  const menu = useMemo(
    () =>
      pricedMenu(
        rawMenu,
        isWalkIn ? { orderType: "takeaway" } : { orderType: "dine-in", areaId },
      ),
    [rawMenu, areaId, isWalkIn],
  );
  const items = useMemo(
    () => filterMenu(menu, search, category),
    [menu, search, category],
  );
  const draftCount = cart.draft.reduce((sum, l) => sum + l.quantity, 0);
  const draftTotal = cart.draft.reduce(
    (sum, l) => sum + draftUnitPrice(l) * l.quantity,
    0,
  );

  function backToTables() {
    setTableId(null);
    setSheetOpen(false);
    setSearch("");
    cart.open(null);
  }

  function startWalkIn() {
    setMessage(null);
    setTab("orders");
    setWalkRef(newWalkInRef());
    setGuests(1);
    setTableId(WALKIN);
    cart.open(null);
  }

  function resumeWalkIn(order: PosOrderSummary) {
    setMessage(null);
    setTab("orders");
    setWalkRef(walkInRefOf(order.customerName));
    setTableId(WALKIN);
    cart.open(order._id);
  }

  function openTable(t: PosTable) {
    setMessage(null);
    if (t.orders.length === 0) {
      setAskGuests(t);
      return;
    }
    setTableId(t._id);
    cart.open(t.orders[0]._id);
  }

  async function releaseCurrentTable() {
    if (!table) return;
    const ok = await confirmDialog({
      title: `Release table ${table.code}?`,
      message:
        "Orders that are still waiting for payment and were never sent to the kitchen will be cancelled.",
      confirmLabel: "Release table",
    });
    if (!ok) return;
    void run(async () => {
      await releasePosTable.mutateAsync(table._id);
      setMessage({ tone: "ok", text: `Table ${table.code} is free` });
      backToTables();
    });
  }

  function releaseFreeTable() {
    if (!askGuests) return;
    const { _id, code } = askGuests;
    setAskGuests(null);
    void run(async () => {
      await releasePosTable.mutateAsync(_id);
      setMessage({ tone: "ok", text: `Table ${code} is free` });
    });
  }

  function startTable(count: number) {
    if (!askGuests) return;
    setGuests(count);
    setTableId(askGuests._id);
    cart.open(null);
    setAskGuests(null);
  }

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setMessage({ tone: "error", text: extractErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  const target = () =>
    isWalkIn
      ? {
          orderType: "takeaway" as const,
          customerName: `Walk-in ${walkRef}`,
          members: guests,
        }
      : {
          orderType: "dine-in" as const,
          tableId: tableId ?? undefined,
          members: guests,
        };

  function sendKot() {
    void run(async () => {
      const { kot } = await cart.save(!cafe, target());
      setMessage({
        tone: "ok",
        text: cafe
          ? `${placeLabel}: order sent to the counter. The kitchen gets it once it is paid.`
          : kot
            ? `${placeLabel}: KOT T${kot.tokenNumber ?? ""} sent`
            : "Order saved",
      });
      backToTables();
    });
  }

  /** Cafe flow: take the payment here (UPI QR, cash, card...), then mark it paid and the kitchen gets the KOT. */
  function payNow() {
    void run(async () => {
      const { id } = await cart.save(false, target());
      if (!id) return;
      await cart.bill(id);
      queryClient.setQueryData(orderKeys.detail(id), await ordersApi.get(id));
      setSettleOpen(true);
    });
  }

  async function afterPay() {
    setSettleOpen(false);
    const id = cart.orderId;
    if (!id) return;
    const fresh = await ordersApi.get(id);
    if (fresh.order.status !== "closed") return;
    const tokens = [
      ...new Set(
        fresh.items
          .filter((i) => i.status !== "cancelled" && i.tokenNumber != null)
          .map((i) => i.tokenNumber),
      ),
    ];
    setMessage({
      tone: "ok",
      text: `${placeLabel}: paid, sent to the kitchen${tokens.length ? ` as token T${tokens.join(", T")}` : ""}`,
    });
    backToTables();
  }

  function requestBill() {
    void run(async () => {
      const { id } = await cart.save(true, target());
      if (!id) return;
      const justBilled = await cart.bill(id);
      if (
        printing?.billPrinterConfigured &&
        !(justBilled && printing.autoPrintBill)
      )
        await ordersApi.printBill(id);
      setMessage({
        tone: "ok",
        text: printing?.billPrinterConfigured
          ? `${placeLabel}: bill is printing at the counter`
          : `${placeLabel}: bill is ready at the counter`,
      });
      backToTables();
    });
  }

  return (
    <div className="flex h-dvh flex-col bg-slate-100">
      {canMessages && (
        <MessageToasts
          conversations={conversations}
          ready={conversationsQuery.isSuccess}
          suppress={tab === "requests" && !tableId}
          onOpen={() => {
            setTableId(null);
            setSheetOpen(false);
            setTab("requests");
          }}
        />
      )}
      <header className="flex shrink-0 items-center gap-3 bg-slate-900 px-3 py-2.5 text-white">
        {tableId ? (
          <button
            type="button"
            onClick={backToTables}
            className="inline-flex min-h-[40px] items-center gap-1 rounded-lg bg-slate-800 px-3 text-sm font-medium"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Tables
          </button>
        ) : (
          <span className="flex items-center gap-2 text-base font-bold">
            <Smartphone
              size={18}
              className="text-orange-400"
              aria-hidden="true"
            />
            Captain
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-sm text-slate-300">
          {isWalkIn
            ? `No-table order · ${walkRef}`
            : table
              ? `Table ${table.code}${cart.orderId ? "" : ` · ${guests} guests`}`
              : profile?.username}
        </span>
        {cafe && table && table.status !== "available" && (
          <button
            type="button"
            onClick={() => void releaseCurrentTable()}
            disabled={busy}
            className="inline-flex min-h-[40px] items-center rounded-lg bg-slate-800 px-3 text-sm font-medium"
          >
            Release
          </button>
        )}
        {!tableId && tab === "tables" && hasAssigned && (
          <button
            type="button"
            onClick={() => setMineOnly((v) => !v)}
            className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold"
          >
            {mineOnly ? "My tables" : "All tables"}
          </button>
        )}
        <ThemeToggleButton />
        <StaffSignOut to="/captain/login" />
      </header>

      {message && (
        <div
          role="status"
          className={`shrink-0 px-4 py-2 text-sm font-medium ${
            message.tone === "ok"
              ? "bg-green-100 text-green-900"
              : "bg-red-100 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      <main className="min-h-0 flex-1 overflow-y-auto">
        {tab === "tables" && !tableId && (
          <TableMap
            tables={myTables}
            areas={floor?.areas}
            onSelect={openTable}
            showOrderStatus
            cafe={cafe}
          />
        )}
        {(tab === "tables" || tab === "orders") && tableId && (
          <div className="flex h-full flex-col">
            <div className="shrink-0 bg-white px-3 pt-2">
              <input
                id="captain-search"
                type="search"
                autoComplete="off"
                placeholder="Search dish or code"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-11 w-full rounded-md border border-slate-300 px-3 text-base"
              />
            </div>
            <div className="min-h-0 flex-1">
              <MenuGrid
                categories={menu.categories}
                category={category}
                onCategory={(id) => {
                  setCategory(id);
                  setSearch("");
                }}
                items={items}
                searching={!!search.trim()}
                quantity=""
                onQuantity={() => {}}
                onPick={(item) => {
                  if (hasOptions(item)) setDishFor(item);
                  else cart.addLine(item, 1);
                }}
                onCustomize={setDishFor}
              />
            </div>
            <button
              type="button"
              data-testid="captain-view-order"
              onClick={() => setSheetOpen(true)}
              className="flex shrink-0 items-center justify-between bg-orange-600 px-4 py-3 text-left font-semibold text-white"
            >
              <span>
                {draftCount > 0
                  ? `${draftCount} new item${draftCount === 1 ? "" : "s"}`
                  : "View order"}
              </span>
              <span>
                {draftCount > 0 ? `₹${draftTotal.toFixed(0)} ›` : "›"}
              </span>
            </button>
          </div>
        )}
        {tab === "orders" && !tableId && (
          <div className="flex min-h-full flex-col">
            <div className="flex flex-1 flex-col gap-2 px-3 pt-3">
              {walkIns.length === 0 ? (
                <p className="px-2 py-10 text-center text-sm text-slate-500">
                  No running orders without a table. Create one below.
                </p>
              ) : (
                walkIns.map((o) => (
                  <button
                    key={o._id}
                    type="button"
                    onClick={() => resumeWalkIn(o)}
                    className="flex min-h-[56px] items-center justify-between gap-3 rounded-xl bg-white px-4 text-left text-sm shadow-card"
                  >
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-800">
                        {walkInRefOf(o.customerName)}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {o.status === "billed"
                          ? "Bill ready"
                          : o.unsent > 0
                            ? "Not sent"
                            : "Running"}
                      </span>
                    </span>
                    <span className="shrink-0 text-slate-600">
                      {o.itemCount} item{o.itemCount === 1 ? "" : "s"} · ₹
                      {o.total.toFixed(0)}
                    </span>
                  </button>
                ))
              )}
            </div>
            <div className="sticky bottom-0 border-t border-slate-200 bg-white p-3">
              <button
                type="button"
                onClick={startWalkIn}
                className="min-h-[48px] w-full rounded-xl bg-orange-600 px-4 text-sm font-semibold text-white active:bg-orange-700"
              >
                + New order without a table
              </button>
            </div>
          </div>
        )}
        {tab === "ready" &&
          (canKitchen ? (
            <ReadyList groups={myGroups} />
          ) : (
            <NoTabAccess page="Kitchen Queue" />
          ))}
        {tab === "requests" &&
          (canMessages ? (
            <RequestFeed conversations={conversations} />
          ) : (
            <NoTabAccess page="Messages" />
          ))}
      </main>

      {!tableId && (
        <nav className="flex shrink-0 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
          <TabButton
            active={tab === "tables"}
            onClick={() => setTab("tables")}
            label="Tables"
            count={0}
            icon={LayoutGrid}
          />
          <TabButton
            active={tab === "orders"}
            onClick={() => setTab("orders")}
            label="Orders"
            count={walkIns.length}
            icon={ClipboardList}
          />
          <TabButton
            active={tab === "ready"}
            onClick={() => setTab("ready")}
            label="Ready"
            count={readyCount}
            icon={HandPlatter}
          />
          <TabButton
            active={tab === "requests"}
            onClick={() => setTab("requests")}
            label="Requests"
            count={unread}
            icon={MessagesSquare}
          />
        </nav>
      )}

      {askGuests && (
        <div
          className="fixed inset-0 z-40 flex items-end bg-black/40"
          onClick={() => setAskGuests(null)}
        >
          <div
            role="dialog"
            aria-label="How many guests"
            className="w-full rounded-t-2xl bg-white p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-4 text-base font-semibold text-slate-900">
              Table {askGuests.code}: how many guests?
            </p>
            <div className="grid grid-cols-4 gap-2">
              {GUEST_COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => startTable(n)}
                  className="h-14 rounded-xl bg-slate-100 text-xl font-bold text-slate-800 active:bg-orange-100"
                >
                  {n}
                </button>
              ))}
            </div>
            {askGuests.status !== "available" &&
              askGuests.orders.length === 0 && (
                <button
                  type="button"
                  onClick={releaseFreeTable}
                  disabled={busy}
                  className="mt-3 h-12 w-full rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 active:bg-slate-100"
                >
                  No order here: release table
                </button>
              )}
          </div>
        </div>
      )}

      {sheetOpen && (table || isWalkIn) && (
        <div className="fixed inset-0 z-30 flex flex-col bg-white">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-3 py-2">
            <span className="font-semibold text-slate-800">Order</span>
            <button
              type="button"
              className="rounded-md px-3 py-1.5 text-sm text-slate-600"
              onClick={() => setSheetOpen(false)}
            >
              Add more
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <OrderPanel
              phone
              className="w-full"
              title={isWalkIn ? `Order ${walkRef}` : `Table ${table?.code}`}
              detail={cart.detail}
              draft={cart.draft}
              customerName={null}
              onCustomerName={() => {}}
              onDraftQuantity={cart.changeQuantity}
              onDraftRemove={cart.removeLine}
              onSaveKot={sendKot}
              onHold={null}
              onBill={requestBill}
              onSettle={cafe ? payNow : null}
              cafe={cafe}
              busy={busy}
            />
          </div>
        </div>
      )}

      {cafe && cart.detail && (
        <SettleDialog
          open={settleOpen}
          orderId={cart.detail.order._id}
          total={cart.detail.totals.grandTotal}
          invoiceNumber={cart.detail.order.invoiceNumber}
          upi={cart.detail.payment}
          onClose={() => void afterPay()}
        />
      )}

      <DishDialog
        food={dishFor}
        onClose={() => setDishFor(null)}
        onAdd={(food, payload) => {
          const item = menu.items.find((i) => i._id === food._id);
          if (item)
            cart.addLine(
              item,
              payload.quantity,
              payload.modifiers,
              payload.note.trim(),
              payload.isJain,
            );
          setDishFor(null);
        }}
      />
    </div>
  );
}
