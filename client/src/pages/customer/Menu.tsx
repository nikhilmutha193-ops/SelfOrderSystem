import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, extractErrorMessage } from "../../lib/apiClient";
import { useTableSession } from "../../lib/useTableSession";
import { Button, ErrorText, Input, Select } from "../../components/ui";
import ChatFab from "../../components/ChatFab";
import DishDialog from "../../components/DishDialog";
import { BestsellerTag, FoodTypeIcon, RatingChip } from "../../components/FoodBadges";
import QuickRequests from "../../components/QuickRequests";
import type { CartLine, MenuCategory, MenuFoodItem } from "../../lib/types";

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

  function getCartQty(foodItemId: string) {
    return cart.find((l) => l.foodItemId === foodItemId)?.quantity ?? 0;
  }

  function incrementCart(food: MenuFoodItem) {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.foodItemId === food._id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { foodItemId: food._id, name: food.name, price: food.price, quantity: 1 }];
    });
  }

  function decrementCart(foodItemId: string) {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.foodItemId === foodItemId);
      if (idx < 0) return prev;
      if (prev[idx].quantity <= 1) return prev.filter((_, i) => i !== idx);
      const next = [...prev];
      next[idx] = { ...next[idx], quantity: next[idx].quantity - 1 };
      return next;
    });
  }

  function removeLine(idx: number) {
    setCart((prev) => prev.filter((_, i) => i !== idx));
  }

  async function confirmOrder() {
    if (cart.length === 0 || !orderId) return;
    setConfirming(true);
    setError(null);
    try {
      await api.post(`/orders/${orderId}/items`, {
        items: cart.map((l) => ({ foodItemId: l.foodItemId, quantity: l.quantity })),
      });
      setCart([]);
      navigate("/order/invoice");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setConfirming(false);
    }
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
                if (query && !food.name.toLowerCase().includes(query) && !food.description?.toLowerCase().includes(query)) {
                  return false;
                }
                return true;
              })
            ),
          }))
          .filter((sub) => sub.foodItems.length > 0),
      }))
      .filter((category) => category.subcategories.length > 0);
  }, [menu, search, sortBy, bestsellerOnly, vegOnly]);

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
          <Button variant="secondary" className="rounded-xl" onClick={() => navigate("/order/invoice")}>
            My order
          </Button>
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
                {category.name}
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
                  cartQty={getCartQty(food._id)}
                  onIncrement={incrementCart}
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
              <h2 className="mb-3 text-xl font-bold tracking-tight text-slate-900">{category.name}</h2>
              {category.subcategories.map((sub) => (
                <div key={sub._id} className="mb-4">
                  <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                    {sub.name}
                    <span className="h-px flex-1 bg-slate-200" />
                    <span className="font-semibold normal-case tracking-normal">{sub.foodItems.length}</span>
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {sub.foodItems.map((food) => (
                      <FoodCard
                        key={food._id}
                        food={food}
                        cartQty={getCartQty(food._id)}
                        onIncrement={incrementCart}
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
        qty={detailFood ? getCartQty(detailFood._id) : 0}
        onIncrement={incrementCart}
        onDecrement={decrementCart}
        onClose={() => setDetailFood(null)}
      />

      {cartCount === 0 && <ChatFab />}

      {cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
          <div className="mx-auto max-w-3xl px-4 py-3">
            {showCart && (
              <div className="mb-3 flex max-h-56 flex-col gap-2 overflow-y-auto rounded-xl bg-slate-50 p-2">
                {cart.map((line, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-slate-700">
                      {line.name} <span className="text-slate-400">x {line.quantity}</span>
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
              <Button className="shrink-0 rounded-xl px-6" onClick={confirmOrder} disabled={confirming}>
                {confirming ? "Placing..." : "Place order"}
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
  cartQty,
  onIncrement,
  onDecrement,
  onOpen,
}: {
  food: MenuFoodItem;
  cartQty: number;
  onIncrement: (food: MenuFoodItem) => void;
  onDecrement: (foodItemId: string) => void;
  onOpen: (food: MenuFoodItem) => void;
}) {
  const qty = cartQty;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md">
      {/* Image and text open the full dish view; the ADD column stays its own
          control so tapping it never opens the sheet. */}
      <button type="button" onClick={() => onOpen(food)} aria-label={`View ${food.name}`} className="shrink-0">
        {food.imageUrl ? (
          <img
            src={food.imageUrl}
            alt={food.name}
            loading="lazy"
            className="h-20 w-20 rounded-xl object-cover shadow-sm"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-gradient-to-br from-orange-100 to-amber-50 text-2xl font-bold text-orange-400">
            {food.name.charAt(0).toUpperCase()}
          </div>
        )}
      </button>

      <button type="button" onClick={() => onOpen(food)} className="min-w-0 flex-1 text-left">
        <div className="flex flex-wrap items-center gap-1.5">
          <FoodTypeIcon type={food.foodType} />
          <RatingChip rating={food.rating} />
          {food.isBestseller && <BestsellerTag emoji={food.bestsellerEmoji} />}
        </div>

        <p className="mt-1 text-[15px] font-semibold leading-snug text-slate-900">{food.name}</p>
        <p className="mt-0.5 text-sm font-bold text-slate-800">₹{food.price.toFixed(2)}</p>

        {food.description && (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
            {food.description}
          </p>
        )}
        <span className="mt-1 inline-block text-[11px] font-semibold text-orange-600">More details</span>
      </button>

      {/* Its own column on the right, so the action sits in one predictable place
          down the whole list rather than moving with each dish's text length. */}
      <div className="w-24 shrink-0">
        {qty === 0 ? (
          <button
            onClick={() => onIncrement(food)}
            className="flex h-11 w-full items-center justify-center rounded-xl border border-orange-600 bg-white text-base font-bold tracking-wide text-orange-600 shadow-sm hover:bg-orange-50"
          >
            ADD
          </button>
        ) : (
          <div className="flex h-11 w-full items-center justify-between rounded-xl bg-orange-600 px-0.5 text-white shadow-sm">
            <button
              onClick={() => onDecrement(food._id)}
              aria-label={`Remove one ${food.name}`}
              className="flex h-full w-8 items-center justify-center text-xl font-bold leading-none"
            >
              −
            </button>
            <span className="text-base font-bold tabular-nums">{qty}</span>
            <button
              onClick={() => onIncrement(food)}
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
