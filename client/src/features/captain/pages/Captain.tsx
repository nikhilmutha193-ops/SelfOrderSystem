import { ArrowLeft, HandPlatter, LayoutGrid, MessagesSquare, Smartphone, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import DishDialog from "../../../components/DishDialog";
import { can, useAdmin } from "../../../lib/adminAuth";
import type { ChatConversation, KotQueueGroup, PosMenu, PosMenuItem, PosTable } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { POLL } from "../../../shared/api/queryClient";
import { useConversations } from "../../chat/queries";
import { useKotQueue } from "../../kitchen/queries";
import { ordersApi } from "../../orders/api";
import { draftUnitPrice } from "../../pos/api";
import { MenuGrid } from "../../pos/components/MenuGrid";
import { OrderPanel } from "../../pos/components/OrderPanel";
import { TableMap } from "../../pos/components/TableMap";
import { usePosFloor, usePosMenu } from "../../pos/queries";
import { filterMenu, hasOptions, usePosCart } from "../../pos/usePosCart";
import { usePrintingStatus } from "../../printing/queries";
import { ReadyList } from "../components/ReadyList";
import { RequestFeed } from "../components/RequestFeed";
import { tableCode } from "../tableCode";

type Tab = "tables" | "ready" | "requests";

const NO_MENU: PosMenu = { categories: [], items: [] };
const NO_TABLES: PosTable[] = [];
const NO_GROUPS: KotQueueGroup[] = [];
const NO_CONVERSATIONS: ChatConversation[] = [];
const GUEST_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8];

function useCaptainManifest() {
  useEffect(() => {
    const added: HTMLElement[] = [];
    const add = (tag: string, attrs: Record<string, string>) => {
      const el = document.createElement(tag);
      for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
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
      <span className={`flex h-7 w-14 items-center justify-center rounded-full ${active ? "bg-orange-100" : ""}`}>
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

export default function Captain() {
  useCaptainManifest();
  const { profile } = useAdmin();
  const menu = usePosMenu().data ?? NO_MENU;
  const tables = usePosFloor().data?.tables ?? NO_TABLES;
  const printing = usePrintingStatus().data;
  const canKitchen = can(profile, "kot");
  const canMessages = can(profile, "messages");
  const queue = useKotQueue(undefined, undefined, canKitchen);
  const groups = canKitchen ? (queue.data ?? NO_GROUPS) : NO_GROUPS;
  const conversationsQuery = useConversations(POLL.conversations, canMessages);
  const conversations = canMessages ? (conversationsQuery.data ?? NO_CONVERSATIONS) : NO_CONVERSATIONS;
  const cart = usePosCart();

  const [tab, setTab] = useState<Tab>("tables");
  const [mineOnly, setMineOnly] = useState(true);
  const [tableId, setTableId] = useState<string | null>(null);
  const [guests, setGuests] = useState(2);
  const [askGuests, setAskGuests] = useState<PosTable | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [dishFor, setDishFor] = useState<PosMenuItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const hasAssigned = tables.some((t) => t.captainId === profile?.id);
  const myTables = hasAssigned && mineOnly ? tables.filter((t) => t.captainId === profile?.id) : tables;
  const myCodes = new Set(myTables.map((t) => t.code));
  const myGroups = hasAssigned && mineOnly ? groups.filter((g) => myCodes.has(tableCode(g.order) ?? "")) : groups;
  const readyCount = myGroups.reduce((sum, g) => sum + g.items.filter((i) => i.status === "ready").length, 0);
  const unread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
  const table = tables.find((t) => t._id === tableId) ?? null;
  const items = useMemo(() => filterMenu(menu, search, category), [menu, search, category]);
  const draftCount = cart.draft.reduce((sum, l) => sum + l.quantity, 0);
  const draftTotal = cart.draft.reduce((sum, l) => sum + draftUnitPrice(l) * l.quantity, 0);

  function backToTables() {
    setTableId(null);
    setSheetOpen(false);
    setSearch("");
    cart.open(null);
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

  const target = () => ({ orderType: "dine-in" as const, tableId: tableId ?? undefined, members: guests });

  function sendKot() {
    const code = table?.code;
    void run(async () => {
      const { kot } = await cart.save(true, target());
      setMessage({ tone: "ok", text: kot ? `Table ${code}: KOT T${kot.tokenNumber ?? ""} sent` : "Order saved" });
      backToTables();
    });
  }

  function requestBill() {
    const code = table?.code;
    void run(async () => {
      const { id } = await cart.save(true, target());
      if (!id) return;
      const justBilled = await cart.bill(id);
      if (printing?.billPrinterConfigured && !(justBilled && printing.autoPrintBill)) await ordersApi.printBill(id);
      setMessage({
        tone: "ok",
        text: printing?.billPrinterConfigured
          ? `Table ${code}: bill is printing at the counter`
          : `Table ${code}: bill is ready at the counter`,
      });
      backToTables();
    });
  }

  return (
    <div className="flex h-dvh flex-col bg-slate-100">
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
            <Smartphone size={18} className="text-orange-400" aria-hidden="true" />
            Captain
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-sm text-slate-300">
          {table ? `Table ${table.code}${cart.orderId ? "" : ` · ${guests} guests`}` : profile?.username}
        </span>
        {!tableId && tab === "tables" && hasAssigned && (
          <button
            type="button"
            onClick={() => setMineOnly((v) => !v)}
            className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold"
          >
            {mineOnly ? "My tables" : "All tables"}
          </button>
        )}
      </header>

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

      <main className="min-h-0 flex-1 overflow-y-auto">
        {tab === "tables" && !tableId && <TableMap tables={myTables} onSelect={openTable} />}
        {tab === "tables" && tableId && (
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
              />
            </div>
            <button
              type="button"
              data-testid="captain-view-order"
              onClick={() => setSheetOpen(true)}
              className="flex shrink-0 items-center justify-between bg-orange-600 px-4 py-3 text-left font-semibold text-white"
            >
              <span>{draftCount > 0 ? `${draftCount} new item${draftCount === 1 ? "" : "s"}` : "View order"}</span>
              <span>{draftCount > 0 ? `₹${draftTotal.toFixed(0)} ›` : "›"}</span>
            </button>
          </div>
        )}
        {tab === "ready" && <ReadyList groups={myGroups} />}
        {tab === "requests" && <RequestFeed conversations={conversations} />}
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
          {canKitchen && (
            <TabButton
              active={tab === "ready"}
              onClick={() => setTab("ready")}
              label="Ready"
              count={readyCount}
              icon={HandPlatter}
            />
          )}
          {canMessages && (
            <TabButton
              active={tab === "requests"}
              onClick={() => setTab("requests")}
              label="Requests"
              count={unread}
              icon={MessagesSquare}
            />
          )}
        </nav>
      )}

      {askGuests && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={() => setAskGuests(null)}>
          <div
            role="dialog"
            aria-label="How many guests"
            className="w-full rounded-t-2xl bg-white p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-4 text-base font-semibold text-slate-900">Table {askGuests.code}: how many guests?</p>
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
          </div>
        </div>
      )}

      {sheetOpen && table && (
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
              title={`Table ${table.code}`}
              detail={cart.detail}
              draft={cart.draft}
              customerName={null}
              onCustomerName={() => {}}
              onDraftQuantity={cart.changeQuantity}
              onDraftRemove={cart.removeLine}
              onSaveKot={sendKot}
              onHold={null}
              onBill={requestBill}
              onSettle={null}
              busy={busy}
            />
          </div>
        </div>
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
    </div>
  );
}
