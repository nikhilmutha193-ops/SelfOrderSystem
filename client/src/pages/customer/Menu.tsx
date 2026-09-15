import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, extractErrorMessage } from "../../lib/apiClient";
import { useTableSession } from "../../lib/useTableSession";
import { Button, ErrorText, Input, Select } from "../../components/ui";
import ChatFab from "../../components/ChatFab";
import QuickRequests from "../../components/QuickRequests";
import type { CartLine, MenuCategory, MenuFoodItem } from "../../lib/types";

type SortOption = "recommended" | "priceLowHigh" | "priceHighLow" | "nameAsc" | "bestsellerFirst";

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

  function getCartQty(foodItemId: string, isJain: boolean) {
    return cart.find((l) => l.foodItemId === foodItemId && l.isJain === isJain)?.quantity ?? 0;
  }

  function incrementCart(food: MenuFoodItem, isJain: boolean) {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.foodItemId === food._id && l.isJain === isJain);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { foodItemId: food._id, name: food.name, price: food.price, quantity: 1, isJain }];
    });
  }

  function decrementCart(foodItemId: string, isJain: boolean) {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.foodItemId === foodItemId && l.isJain === isJain);
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
        items: cart.map((l) => ({ foodItemId: l.foodItemId, quantity: l.quantity, isJain: l.isJain })),
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

    function sortItems(items: MenuFoodItem[]): MenuFoodItem[] {
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

    return menu
      .map((category) => ({
        ...category,
        subcategories: category.subcategories
          .map((sub) => ({
            ...sub,
            foodItems: sortItems(
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
        {filteredMenu.map((category) => (
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
                      cartQtyRegular={getCartQty(food._id, false)}
                      cartQtyJain={getCartQty(food._id, true)}
                      onIncrement={incrementCart}
                      onDecrement={decrementCart}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
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
                      {line.name} x {line.quantity} {line.isJain && "(Jain)"}
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
  cartQtyRegular,
  cartQtyJain,
  onIncrement,
  onDecrement,
}: {
  food: MenuFoodItem;
  cartQtyRegular: number;
  cartQtyJain: number;
  onIncrement: (food: MenuFoodItem, isJain: boolean) => void;
  onDecrement: (foodItemId: string, isJain: boolean) => void;
}) {
  const [isJain, setIsJain] = useState(false);
  const qty = isJain ? cartQtyJain : cartQtyRegular;

  return (
    <div className="flex items-start justify-between gap-3 p-3">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-slate-800">{food.name}</p>
          {food.isBestseller && (
            <span className="rounded-sm bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
              {food.bestsellerEmoji || "⭐"} Bestseller
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm font-semibold text-slate-700">₹{food.price.toFixed(2)}</p>
        {food.description && <p className="mt-1 text-xs text-slate-500">{food.description}</p>}
        <label className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
          <input type="checkbox" checked={isJain} onChange={(e) => setIsJain(e.target.checked)} />
          Jain (No Onion and Garlic)
        </label>
      </div>

      <div className="flex shrink-0 flex-col items-center gap-1">
        <div className="relative h-16 w-16">
          {food.imageUrl ? (
            <img src={food.imageUrl} alt={food.name} className="h-16 w-16 rounded-lg object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-orange-50 text-lg font-bold text-orange-300">
              {food.name.charAt(0).toUpperCase()}
            </div>
          )}
          {food.isBestseller && (
            <span
              className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm shadow"
              title="Bestseller"
            >
              {food.bestsellerEmoji || "⭐"}
            </span>
          )}
        </div>
        {qty === 0 ? (
          <button
            onClick={() => onIncrement(food, isJain)}
            className="w-16 -translate-y-2 rounded-lg border border-orange-600 bg-white px-2 py-1.5 text-sm font-semibold text-orange-600 shadow-sm hover:bg-orange-50"
          >
            ADD
          </button>
        ) : (
          <div className="flex w-16 -translate-y-2 items-center justify-between rounded-lg border border-orange-600 bg-orange-600 px-1.5 py-1.5 text-white shadow-sm">
            <button onClick={() => onDecrement(food._id, isJain)} className="px-1 font-bold leading-none">
              −
            </button>
            <span className="text-sm font-semibold">{qty}</span>
            <button onClick={() => onIncrement(food, isJain)} className="px-1 font-bold leading-none">
              +
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
