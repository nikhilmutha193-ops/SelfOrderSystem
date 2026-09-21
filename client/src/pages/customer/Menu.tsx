import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, clearStoredToken, extractErrorMessage, setActiveAuth } from "../../lib/apiClient";
import { useTableSession } from "../../lib/useTableSession";
import { Button, ErrorText, Input, Select, Textarea } from "../../components/ui";
import ChatFab from "../../components/ChatFab";
import DishDialog, { type DishAddPayload } from "../../components/DishDialog";
import { BestsellerTag, FoodTypeIcon, RatingChip } from "../../components/FoodBadges";
import QuickRequests from "../../components/QuickRequests";
import { ReviewDialog, StarPicker } from "../../components/ReviewFab";
import { tr, LANGS, loadLang, saveLang, type Lang } from "../../lib/i18n";
import { newId } from "../../lib/id";
import type { CartLine, MenuCategory, MenuFoodItem, OrderDetailResponse } from "../../lib/types";

/** Door-with-arrow "leave" glyph, icon-only so it doesn't compete with "My order" for space. */
function LeaveIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

/** Outline star, for the "rate us" affordance - filled stars are reserved for an actual rating. */
function StarOutlineIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M12 2.5l2.9 6.6 7.1.6-5.4 4.7 1.7 7-6.3-3.8-6.3 3.8 1.7-7-5.4-4.7 7.1-.6z" />
    </svg>
  );
}

type SortOption = "recommended" | "priceLowHigh" | "priceHighLow" | "nameAsc" | "bestsellerFirst";

function sortItems(sortBy: SortOption, items: MenuFoodItem[]): MenuFoodItem[] {
  const copy = [...items];
  switch (sortBy) {
    case "priceLowHigh":
      return copy.sort((a, b) => a.price - b.price);
    case "priceHighLow":
      return copy.sort((a, b) => b.price - a.price);
    case "nameAsc":
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    case "bestsellerFirst":
      return copy.sort((a, b) => Number(!!b.isBestseller) - Number(!!a.isBestseller));
    default:
      return copy;
  }
}

/** Order-item statuses that still count as "active" - not yet served or cancelled, so still
 *  with the kitchen or waiting to be picked up. Used to warn before leaving the table. */
const ACTIVE_ITEM_STATUSES = new Set(["pending", "preparing", "ready"]);

const SORT_LABELS: Record<SortOption, string> = {
  recommended: "Recommended",
  bestsellerFirst: "Bestsellers first",
  priceLowHigh: "Price: Low to High",
  priceHighLow: "Price: High to Low",
  nameAsc: "Name: A to Z",
};

export default function Menu() {
  const { orderId } = useTableSession();
  const navigate = useNavigate();
  const [menu, setMenu] = useState<MenuCategory[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [detailFood, setDetailFood] = useState<MenuFoodItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  /** Items still pending/preparing/ready (not yet served or cancelled) on the current order,
   *  checked right before showing the leave-table confirmation. null = not checked/unknown yet. */
  const [activeItemCount, setActiveItemCount] = useState<number | null>(null);
  const [leavingTable, setLeavingTable] = useState(false);
  const leavingRef = useRef(false);
  // Quick "rate your visit" built into the leave-table dialog itself, since leaving is exactly
  // when a guest's opinion of the visit is freshest. Entirely optional - leaving works with no
  // rating picked. Name is pulled from the order (fetched alongside the active-item check)
  // rather than asked again, since the guest already gave it at check-in.
  const [leaveRating, setLeaveRating] = useState(0);
  const [leaveComment, setLeaveComment] = useState("");
  const [leaveCustomerName, setLeaveCustomerName] = useState("");

  const [lang, setLang] = useState<Lang>(loadLang);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("recommended");
  const [bestsellerOnly, setBestsellerOnly] = useState(false);
  const [vegOnly, setVegOnly] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const navRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!orderId) {
      navigate("/order/details", { replace: true });
      return;
    }
    api
      .get<MenuCategory[]>("/menu")
      .then((res) => {
        setMenu(res.data);
        if (res.data.length > 0) setActiveCategoryId(res.data[0]._id);
      })
      .catch((err) => setError(extractErrorMessage(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const cartTotal = useMemo(() => cart.reduce((sum, l) => sum + l.price * l.quantity, 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((sum, l) => sum + l.quantity, 0), [cart]);

  // The "plain" line for a dish: no modifiers and no note. Customized picks live on their own lines.
  const isPlain = (l: CartLine) => (!l.modifiers || l.modifiers.length === 0) && !l.note;

  function getCartQty(foodItemId: string) {
    return cart.find((l) => l.foodItemId === foodItemId && isPlain(l))?.quantity ?? 0;
  }

  function incrementCart(food: MenuFoodItem) {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.foodItemId === food._id && isPlain(l));
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { lineId: newId(), foodItemId: food._id, name: food.name, price: food.price, quantity: 1 }];
    });
  }

  function decrementCart(foodItemId: string) {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.foodItemId === foodItemId && isPlain(l));
      if (idx < 0) return prev;
      if (prev[idx].quantity <= 1) return prev.filter((_, i) => i !== idx);
      const next = [...prev];
      next[idx] = { ...next[idx], quantity: next[idx].quantity - 1 };
      return next;
    });
  }

  /** Adds a customized dish (from the dialog) as its own cart line. */
  function addCustomized(food: MenuFoodItem, payload: DishAddPayload) {
    const unitPrice = food.price + payload.modifiers.reduce((s, m) => s + m.priceDelta, 0);
    setCart((prev) => [
      ...prev,
      {
        lineId: newId(),
        foodItemId: food._id,
        name: food.name,
        price: unitPrice,
        quantity: payload.quantity,
        modifiers: payload.modifiers,
        note: payload.note || undefined,
      },
    ]);
  }

  /** Card ADD: dishes with options open the dialog; plain dishes add straight to the cart. */
  function quickAddOrOpen(food: MenuFoodItem) {
    if ((food.modifierGroups?.length ?? 0) > 0) setDetailFood(food);
    else incrementCart(food);
  }

  function removeLine(idx: number) {
    setCart((prev) => prev.filter((_, i) => i !== idx));
  }

  /** Actually submits the cart - only called once the guest confirms in the review popup. */
  async function placeOrder() {
    if (cart.length === 0 || !orderId) return;
    setConfirming(true);
    setError(null);
    try {
      await api.post(`/orders/${orderId}/items`, {
        items: cart.map((l) => ({
          foodItemId: l.foodItemId,
          quantity: l.quantity,
          note: l.note,
          modifiers: l.modifiers?.map((m) => ({ groupName: m.groupName, label: m.label })),
        })),
      });
      setCart([]);
      setReviewOpen(false);
      navigate("/order/invoice");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setConfirming(false);
    }
  }

  /** Opens the leave-table confirmation, checking first whether any items are still active so
   *  the dialog can warn about them rather than understating what "leave" actually means here.
   *  Also resets and primes the built-in "rate your visit" fields for this fresh open. */
  async function openLeaveConfirm() {
    setLeaveConfirmOpen(true);
    setActiveItemCount(null);
    setLeaveRating(0);
    setLeaveComment("");
    if (!orderId) return;
    try {
      const res = await api.get<OrderDetailResponse>(`/orders/${orderId}`);
      const active = res.data.items.filter((it) => ACTIVE_ITEM_STATUSES.has(it.status)).length;
      setActiveItemCount(active);
      setLeaveCustomerName(res.data.order.customerName || "");
    } catch {
      // Non-critical - the dialog still works without the extra warning if this fails.
    }
  }

  /**
   * Leaves and frees this table for the next guest, same as an admin releasing it: anything
   * not yet sent to the kitchen is cancelled with the seating; anything already fired stays
   * open for staff to settle. The active-order check above already warned about that before
   * this runs, so by the time it's called the guest has chosen to proceed anyway.
   */
  async function leaveTable() {
    if (leavingRef.current) return; // guards a double-tap from firing the release twice
    leavingRef.current = true;
    setLeavingTable(true);
    if (leaveRating > 0) {
      try {
        await api.post("/reviews", {
          customerName: leaveCustomerName || "Guest",
          rating: leaveRating,
          comment: leaveComment,
        });
      } catch {
        // Non-critical - a failed review submission shouldn't block leaving the table.
      }
    }
    try {
      await api.patch("/tables/session/release");
    } catch {
      /* non-critical - the table auto-releases later if this doesn't go through */
    }
    clearStoredToken("table");
    setActiveAuth(null);
    try {
      localStorage.removeItem("selforder_table_code");
    } catch {
      /* ignore - the code just won't be prefilled next time */
    }
    navigate("/order", { replace: true });
  }

  const isFiltering = search.trim().length > 0 || bestsellerOnly || vegOnly || sortBy !== "recommended";

  const filteredMenu = useMemo(() => {
    const query = search.trim().toLowerCase();

    return menu
      .map((category) => ({
        ...category,
        subcategories: category.subcategories
          .map((sub) => ({
            ...sub,
            foodItems: sortItems(
              sortBy,
              sub.foodItems.filter((food) => {
                if (bestsellerOnly && !food.isBestseller) return false;
                if (vegOnly && (food.foodType ?? "veg") !== "veg") return false;
                if (query) {
                  const hay = `${food.name} ${food.description ?? ""} ${tr(food, lang, "name")} ${tr(food, lang, "description")}`.toLowerCase();
                  if (!hay.includes(query)) return false;
                }
                return true;
              })
            ),
          }))
          .filter((sub) => sub.foodItems.length > 0),
      }))
      .filter((category) => category.subcategories.length > 0);
  }, [menu, search, sortBy, bestsellerOnly, vegOnly, lang]);

  /**
   * Sorting inside each subcategory looks broken, because most hold only one or two
   * dishes. While a sort or filter is on, the grouping is dropped and every match is
   * shown as one list ordered across the whole menu.
   */
  const flatResults = useMemo(
    () => sortItems(sortBy, filteredMenu.flatMap((c) => c.subcategories.flatMap((sub) => sub.foodItems))),
    [filteredMenu, sortBy]
  );

  useEffect(() => {
    if (isFiltering) return;
    const sections = Object.entries(sectionRefs.current).filter(([, el]) => el);
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          const id = visible[0].target.getAttribute("data-category-id");
          if (id) setActiveCategoryId(id);
        }
      },
      { rootMargin: "-120px 0px -70% 0px", threshold: 0 }
    );
    sections.forEach(([, el]) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [filteredMenu, isFiltering]);

  function scrollToCategory(categoryId: string) {
    setActiveCategoryId(categoryId);
    sectionRefs.current[categoryId]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function clearFilters() {
    setSearch("");
    setSortBy("recommended");
    setBestsellerOnly(false);
    setVegOnly(false);
  }

  return (
    <div className="mx-auto max-w-3xl pb-32">
      <div className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-4 pt-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Menu</h1>
            <p className="text-xs text-slate-500">Tap a dish for details</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={lang}
              onChange={(e) => {
                const l = e.target.value as Lang;
                setLang(l);
                saveLang(l);
              }}
              aria-label="Menu language"
              className="min-h-[36px] rounded-xl border border-slate-300 px-2 text-sm"
            >
              {LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
            <Button variant="secondary" className="rounded-xl" onClick={() => navigate("/order/invoice")}>
              My order
            </Button>
            <button
              type="button"
              onClick={() => setFeedbackOpen(true)}
              aria-label="Rate us"
              title="Rate us"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-300 text-slate-500 hover:bg-slate-50 hover:text-amber-500"
            >
              <StarOutlineIcon className="h-[18px] w-[18px]" />
            </button>
            <button
              type="button"
              onClick={openLeaveConfirm}
              aria-label="Leave table"
              title="Leave table"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-300 text-slate-500 hover:bg-red-50 hover:text-red-600"
            >
              <LeaveIcon className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>

        <div className="relative px-4 pt-3">
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="pointer-events-none absolute left-7 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            style={{ marginTop: "0.375rem" }}
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
          </svg>
          <Input
            className="!pl-9 rounded-xl"
            placeholder="Search for dishes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-6 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-slate-400 hover:text-slate-600"
              style={{ marginTop: "0.375rem" }}
            >
              ✕
            </button>
          )}
        </div>

        {!isFiltering && menu.length > 0 && (
          <div ref={navRef} className="mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
            {menu.map((category) => (
              <button
                key={category._id}
                onClick={() => scrollToCategory(category._id)}
                className={`min-h-[36px] shrink-0 whitespace-nowrap rounded-xl px-3.5 text-sm font-semibold transition-colors ${
                  activeCategoryId === category._id
                    ? "bg-orange-600 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {tr(category, lang, "name")}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 overflow-x-auto px-4 py-2">
          <button
            onClick={() => setVegOnly((v) => !v)}
            aria-pressed={vegOnly}
            className={`inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-colors ${
              vegOnly ? "border-green-600 bg-green-50 text-green-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <FoodTypeIcon type="veg" size={12} /> Veg
          </button>
          <button
            onClick={() => setBestsellerOnly((v) => !v)}
            aria-pressed={bestsellerOnly}
            className={`min-h-[36px] shrink-0 whitespace-nowrap rounded-xl border px-3 text-sm font-semibold transition-colors ${
              bestsellerOnly
                ? "border-amber-500 bg-amber-50 text-amber-700"
                : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            ★ Bestsellers
          </button>
          <Select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="!w-auto min-h-[36px] shrink-0 rounded-xl !py-1 text-sm"
          >
            {(Object.keys(SORT_LABELS) as SortOption[]).map((opt) => (
              <option key={opt} value={opt}>
                Sort: {SORT_LABELS[opt]}
              </option>
            ))}
          </Select>
          {isFiltering && (
            <button onClick={clearFilters} className="shrink-0 px-1 text-sm font-semibold text-orange-700 underline">
              Clear
            </button>
          )}
        </div>
      </div>

      <QuickRequests />

      <div className="px-4 pt-2">
        <ErrorText>{error}</ErrorText>
      </div>

      <div className="flex flex-col gap-6 px-4 pt-2">
        {isFiltering ? (
          <div>
            <p className="mb-2 text-sm text-slate-500">
              {flatResults.length} dish{flatResults.length === 1 ? "" : "es"}
              {sortBy !== "recommended" && ` · sorted by ${SORT_LABELS[sortBy].toLowerCase()}`}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {flatResults.map((food) => (
                <FoodCard
                  key={food._id}
                  food={food}
                  lang={lang}
                  cartQty={getCartQty(food._id)}
                  onAdd={quickAddOrOpen}
                  onDecrement={decrementCart}
                  onOpen={setDetailFood}
                />
              ))}
            </div>
          </div>
        ) : (
          filteredMenu.map((category) => (
            <div
              key={category._id}
              data-category-id={category._id}
              ref={(el) => {
                sectionRefs.current[category._id] = el;
              }}
              className="scroll-mt-32"
            >
              <h2 className="mb-3 text-xl font-bold tracking-tight text-slate-900">{tr(category, lang, "name")}</h2>
              {category.subcategories.map((sub) => (
                <div key={sub._id} className="mb-4">
                  <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                    {tr(sub, lang, "name")}
                    <span className="h-px flex-1 bg-slate-200" />
                    <span className="font-semibold normal-case tracking-normal">{sub.foodItems.length}</span>
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {sub.foodItems.map((food) => (
                      <FoodCard
                        key={food._id}
                        food={food}
                        lang={lang}
                        cartQty={getCartQty(food._id)}
                        onAdd={quickAddOrOpen}
                        onDecrement={decrementCart}
                        onOpen={setDetailFood}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
        {menu.length === 0 && !error && (
          <div className="grid gap-3 sm:grid-cols-2" aria-label="Loading menu">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex animate-pulse items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <div className="h-20 w-20 shrink-0 rounded-xl bg-slate-100" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-16 rounded bg-slate-100" />
                  <div className="h-4 w-2/3 rounded bg-slate-100" />
                  <div className="h-3 w-12 rounded bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        )}
        {menu.length > 0 && filteredMenu.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-4xl" aria-hidden>🍽️</p>
            <p className="mt-2 text-sm font-medium text-slate-600">No dishes match your search or filters.</p>
            <button onClick={clearFilters} className="mt-2 text-sm font-semibold text-orange-700 underline">
              Clear filters
            </button>
          </div>
        )}
      </div>

      <DishDialog
        food={detailFood}
        lang={lang}
        onAdd={addCustomized}
        onClose={() => setDetailFood(null)}
      />

      <ReviewDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />

      {leaveConfirmOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={() => setLeaveConfirmOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Leave table"
          >
            <h2 className="text-base font-bold text-slate-800">Leave this table?</h2>

            {activeItemCount !== null && activeItemCount > 0 && (
              <p className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <span aria-hidden>⚠️</span>
                <span>
                  Active order in progress - {activeItemCount} item{activeItemCount === 1 ? "" : "s"} still on the way
                  from the kitchen. Anything not yet sent will be cancelled; anything already being prepared stays
                  with staff to serve.
                </span>
              </p>
            )}

            <p className="mt-1.5 text-sm text-slate-500">
              This frees the table for other guests - you can sign back in from this table's QR code or code
              anytime.
            </p>

            <div className="mt-3 rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-medium text-slate-700">Rate your visit</p>
              <p className="mt-0.5 text-xs text-slate-400">Optional - tap a star to leave a quick review as you go.</p>
              <div className="mt-2">
                <StarPicker value={leaveRating} onChange={setLeaveRating} />
              </div>
              {leaveRating > 0 && (
                <Textarea
                  className="mt-2"
                  rows={2}
                  value={leaveComment}
                  onChange={(e) => setLeaveComment(e.target.value)}
                  placeholder="Anything you'd like to add? (optional)"
                />
              )}
            </div>

            <div className="mt-4 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setLeaveConfirmOpen(false)} disabled={leavingTable}>
                Cancel
              </Button>
              <Button variant="danger" className="flex-1" onClick={leaveTable} disabled={leavingTable}>
                {leavingTable ? "Leaving…" : "Leave table"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {cartCount === 0 && <ChatFab />}

      {cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
          <div className="mx-auto max-w-3xl px-4 py-3">
            {showCart && (
              <div className="mb-3 flex max-h-56 flex-col gap-2 overflow-y-auto rounded-xl bg-slate-50 p-2">
                {cart.map((line, idx) => (
                  <div key={line.lineId} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 flex-1 text-slate-700">
                      <span className="truncate">
                        {line.name} <span className="text-slate-400">x {line.quantity}</span>
                      </span>
                      {(line.modifiers?.length || line.note) && (
                        <span className="block truncate text-xs text-slate-400">
                          {[...(line.modifiers?.map((m) => m.label) ?? []), line.note].filter(Boolean).join(", ")}
                        </span>
                      )}
                    </span>
                    <span className="font-semibold tabular-nums text-slate-800">
                      ₹{(line.price * line.quantity).toFixed(2)}
                    </span>
                    <button
                      className="flex h-9 w-9 items-center justify-center text-red-600"
                      aria-label={`Remove ${line.name}`}
                      onClick={() => removeLine(idx)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-3">
              <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setShowCart((v) => !v)}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-600 text-sm font-bold text-white">
                  {cartCount}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold tabular-nums text-slate-900">₹{cartTotal.toFixed(2)}</span>
                  <span className="block text-xs font-medium text-orange-700 underline">
                    {showCart ? "Hide items" : "View items"}
                  </span>
                </span>
              </button>
              <Button className="shrink-0 rounded-xl px-6" onClick={() => setReviewOpen(true)} disabled={confirming}>
                Place order
              </Button>
            </div>
          </div>
        </div>
      )}

      {reviewOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={() => !confirming && setReviewOpen(false)}
        >
          <div
            className="flex w-full max-w-md flex-col rounded-2xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800">Confirm your order</h2>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-600"
                onClick={() => setReviewOpen(false)}
                disabled={confirming}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="mb-3 text-xs text-slate-500">Check everything below before it goes to the kitchen.</p>

            <div className="flex max-h-72 flex-col gap-2 overflow-y-auto rounded-xl bg-slate-50 p-2">
              {cart.map((line, idx) => (
                <div key={line.lineId} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-2 text-sm shadow-sm">
                  <span className="min-w-0 flex-1 text-slate-700">
                    <span className="block truncate font-medium">
                      {line.name} <span className="font-normal text-slate-400">x {line.quantity}</span>
                    </span>
                    {(line.modifiers?.length || line.note) && (
                      <span className="block truncate text-xs text-slate-400">
                        {[...(line.modifiers?.map((m) => m.label) ?? []), line.note].filter(Boolean).join(", ")}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-slate-800">
                    ₹{(line.price * line.quantity).toFixed(2)}
                  </span>
                  <button
                    className="flex h-8 w-8 shrink-0 items-center justify-center text-red-600"
                    aria-label={`Remove ${line.name}`}
                    onClick={() => removeLine(idx)}
                    disabled={confirming}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {cart.length === 0 && (
                <p className="py-6 text-center text-sm text-slate-400">Your cart is empty.</p>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-sm font-bold text-slate-900">
              <span>Total</span>
              <span className="tabular-nums">₹{cartTotal.toFixed(2)}</span>
            </div>

            <ErrorText>{error}</ErrorText>

            <div className="mt-3 flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setReviewOpen(false)}
                disabled={confirming}
              >
                Add more items
              </Button>
              <Button className="flex-1" onClick={placeOrder} disabled={confirming || cart.length === 0}>
                {confirming ? "Placing..." : "Confirm & place order"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FoodCard({
  food,
  lang,
  cartQty,
  onAdd,
  onDecrement,
  onOpen,
}: {
  food: MenuFoodItem;
  lang: Lang;
  cartQty: number;
  onAdd: (food: MenuFoodItem) => void;
  onDecrement: (foodItemId: string) => void;
  onOpen: (food: MenuFoodItem) => void;
}) {
  const qty = cartQty;
  const name = tr(food, lang, "name");
  const description = tr(food, lang, "description");
  const hasOptions = (food.modifierGroups?.length ?? 0) > 0;
  const displayRating = food.guestRating ?? food.rating;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md">
      <button type="button" onClick={() => onOpen(food)} aria-label={`View ${name}`} className="shrink-0">
        {food.imageUrl ? (
          <img src={food.imageUrl} alt={name} loading="lazy" className="h-20 w-20 rounded-xl object-cover shadow-sm" />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-gradient-to-br from-orange-100 to-amber-50 text-2xl font-bold text-orange-400">
            {name.charAt(0).toUpperCase()}
          </div>
        )}
      </button>

      <button type="button" onClick={() => onOpen(food)} className="min-w-0 flex-1 text-left">
        <div className="flex flex-wrap items-center gap-1.5">
          <FoodTypeIcon type={food.foodType} />
          <RatingChip rating={displayRating} />
          {food.reviewCount ? <span className="text-[10px] text-slate-400">({food.reviewCount})</span> : null}
          {food.isBestseller && <BestsellerTag emoji={food.bestsellerEmoji} />}
        </div>

        <p className="mt-1 text-[15px] font-semibold leading-snug text-slate-900">{name}</p>
        <p className="mt-0.5 text-sm font-bold text-slate-800">₹{food.price.toFixed(2)}</p>

        {description && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{description}</p>}
        <span className="mt-1 inline-block text-[11px] font-semibold text-orange-600">More details</span>
      </button>

      <div className="w-24 shrink-0">
        {qty === 0 || hasOptions ? (
          <button
            onClick={() => onAdd(food)}
            className="flex h-11 w-full flex-col items-center justify-center rounded-xl border border-orange-600 bg-white text-sm font-bold tracking-wide text-orange-600 shadow-sm hover:bg-orange-50"
          >
            ADD
            {hasOptions && <span className="text-[9px] font-medium normal-case">customize</span>}
          </button>
        ) : (
          <div className="flex h-11 w-full items-center justify-between rounded-xl bg-orange-600 px-0.5 text-white shadow-sm">
            <button
              onClick={() => onDecrement(food._id)}
              aria-label={`Remove one ${name}`}
              className="flex h-full w-8 items-center justify-center text-xl font-bold leading-none"
            >
              −
            </button>
            <span className="text-base font-bold tabular-nums">{qty}</span>
            <button
              onClick={() => onAdd(food)}
              aria-label={`Add one ${name}`}
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
