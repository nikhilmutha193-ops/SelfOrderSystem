import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, extractErrorMessage } from "../../lib/apiClient";
import { useTableSession } from "../../lib/useTableSession";
import { Button, ErrorText, Input, Select } from "../../components/ui";
import ChatFab from "../../components/ChatFab";
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
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("recommended");
  const [bestsellerOnly, setBestsellerOnly] = useState(false);
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

  const isFiltering = search.trim().length > 0 || bestsellerOnly || sortBy !== "recommended";

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
  }, [menu, search, sortBy, bestsellerOnly]);

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
  }

  return (
    <div className="mx-auto max-w-2xl pb-28">
      <div className="sticky top-0 z-20 bg-white">
        <div className="flex items-center justify-between px-4 pt-4">
          <h1 className="text-xl font-bold text-slate-800">Menu</h1>
          <Button variant="secondary" onClick={() => navigate("/order/invoice")}>
            View my order
          </Button>
        </div>

        <div className="px-4 pt-3">
          <Input
            placeholder="Search for dishes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {!isFiltering && menu.length > 0 && (
          <div ref={navRef} className="mt-3 flex gap-2 overflow-x-auto border-b border-slate-200 px-4 pb-2">
            {menu.map((category) => (
              <button
                key={category._id}
                onClick={() => scrollToCategory(category._id)}
                className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeCategoryId === category._id
                    ? "bg-orange-600 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 px-4 py-2">
          <Select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="w-auto"
          >
            {(Object.keys(SORT_LABELS) as SortOption[]).map((opt) => (
              <option key={opt} value={opt}>
                Sort: {SORT_LABELS[opt]}
              </option>
            ))}
          </Select>
          <button
            onClick={() => setBestsellerOnly((v) => !v)}
            className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
              bestsellerOnly
                ? "border-orange-600 bg-orange-50 text-orange-700"
                : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            ★ Bestsellers
          </button>
          {isFiltering && (
            <button onClick={clearFilters} className="shrink-0 text-sm font-medium text-orange-700 underline">
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
            <div className="flex flex-col divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
              {flatResults.map((food) => (
                <FoodCard
                  key={food._id}
                  food={food}
                  cartQty={getCartQty(food._id)}
                  onIncrement={incrementCart}
                  onDecrement={decrementCart}
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
              <h2 className="mb-2 text-lg font-bold text-slate-800">{category.name}</h2>
              {category.subcategories.map((sub) => (
                <div key={sub._id} className="mb-4">
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                    {sub.name} <span className="text-slate-400">({sub.foodItems.length})</span>
                  </h3>
                  <div className="flex flex-col divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                    {sub.foodItems.map((food) => (
                      <FoodCard
                        key={food._id}
                        food={food}
                        cartQty={getCartQty(food._id)}
                        onIncrement={incrementCart}
                        onDecrement={decrementCart}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
        {menu.length === 0 && !error && <p className="text-sm text-slate-500">Loading menu...</p>}
        {menu.length > 0 && filteredMenu.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-500">No dishes match your search or filters.</p>
        )}
      </div>

      {cartCount === 0 && <ChatFab />}

      {cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
          <div className="mx-auto max-w-2xl px-4 py-3">
            {showCart && (
              <div className="mb-3 flex max-h-60 flex-col gap-2 overflow-y-auto">
                {cart.map((line, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <span>
                      {line.name} x {line.quantity}
                    </span>
                    <div className="flex items-center gap-2">
                      <span>₹{(line.price * line.quantity).toFixed(2)}</span>
                      <button className="text-red-600" onClick={() => removeLine(idx)}>
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between">
              <button
                className="flex flex-col items-start text-left"
                onClick={() => setShowCart((s) => !s)}
              >
                <span className="text-sm font-semibold text-slate-800">
                  {cartCount} item{cartCount > 1 ? "s" : ""} | ₹{cartTotal.toFixed(2)}
                </span>
                <span className="text-xs font-medium text-orange-700 underline">
                  {showCart ? "Hide cart" : "View cart"}
                </span>
              </button>
              <Button onClick={confirmOrder} disabled={confirming}>
                {confirming ? "Placing order..." : "Confirm order"}
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
}: {
  food: MenuFoodItem;
  cartQty: number;
  onIncrement: (food: MenuFoodItem) => void;
  onDecrement: (foodItemId: string) => void;
}) {
  const qty = cartQty;

  return (
    <div className="flex items-center gap-3 p-3 transition-colors hover:bg-orange-50/40">
      {food.imageUrl ? (
        <img
          src={food.imageUrl}
          alt={food.name}
          loading="lazy"
          className="h-20 w-20 shrink-0 rounded-xl object-cover shadow-sm"
        />
      ) : (
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-100 to-amber-50 text-2xl font-bold text-orange-400">
          {food.name.charAt(0).toUpperCase()}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <FoodTypeIcon type={food.foodType} />
          <RatingChip rating={food.rating} />
          {food.isBestseller && <BestsellerTag emoji={food.bestsellerEmoji} />}
        </div>

        <p className="mt-1 text-[15px] font-semibold leading-snug text-slate-900">{food.name}</p>
        <p className="mt-0.5 text-sm font-bold text-slate-800">₹{food.price.toFixed(2)}</p>

        {food.description && (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{food.description}</p>
        )}
      </div>

      {/* Its own column on the right, so the action sits in one predictable place
          down the whole list rather than moving with each dish's text length. */}
      <div className="w-[4.5rem] shrink-0">
        {qty === 0 ? (
          <button
            onClick={() => onIncrement(food)}
            className="flex h-10 w-full items-center justify-center rounded-lg border border-orange-600 bg-white text-sm font-bold tracking-wide text-orange-600 shadow-sm hover:bg-orange-50"
          >
            ADD
          </button>
        ) : (
          <div className="flex h-10 w-full items-center justify-between rounded-lg bg-orange-600 px-1 text-white shadow-sm">
            <button
              onClick={() => onDecrement(food._id)}
              aria-label={`Remove one ${food.name}`}
              className="flex h-full w-6 items-center justify-center text-lg font-bold leading-none"
            >
              −
            </button>
            <span className="text-sm font-bold">{qty}</span>
            <button
              onClick={() => onIncrement(food)}
              aria-label={`Add one ${food.name}`}
              className="flex h-full w-6 items-center justify-center text-lg font-bold leading-none"
            >
              +
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
