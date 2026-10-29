import { Plus, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { useMemo, useState } from "react";

import { FoodTypeIcon } from "../../../components/FoodBadges";
import { tr, type Lang } from "../../../lib/i18n";
import type { CartLine, MenuCategory, MenuFoodItem } from "../../../lib/types";
import { cartCount, cartTotal } from "../cart";
import { kt, rupees } from "../strings";

const ALL = "all";

/** The menu: big category rail on the left, photo cards on the right, the order bar at the bottom. */
export function KioskMenu({
  menu,
  lang,
  cart,
  onPick,
  onReview,
}: {
  menu: MenuCategory[];
  lang: Lang;
  cart: CartLine[];
  onPick: (food: MenuFoodItem) => void;
  onReview: () => void;
}) {
  const [category, setCategory] = useState(ALL);
  const [flash, setFlash] = useState<string | null>(null);
  const sections = useMemo(
    () =>
      menu
        .map((c) => ({ category: c, foods: c.subcategories.flatMap((s) => s.foodItems) }))
        .filter((s) => s.foods.length > 0),
    [menu],
  );
  const shown = category === ALL ? sections : sections.filter((s) => s.category._id === category);
  const qtyOf = (foodId: string) => cart.filter((l) => l.foodItemId === foodId).reduce((n, l) => n + l.quantity, 0);
  const count = cartCount(cart);

  function pick(food: MenuFoodItem) {
    onPick(food);
    if (!food.modifierGroups?.length) {
      setFlash(food._id);
      window.setTimeout(() => setFlash((id) => (id === food._id ? null : id)), 700);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="Categories"
          className="flex w-36 shrink-0 flex-col gap-1.5 overflow-y-auto border-r border-slate-200 bg-white p-2 sm:w-48"
        >
          {[{ _id: ALL, label: kt(lang, "all") }, ...sections.map((s) => ({ _id: s.category._id, label: tr(s.category, lang, "name") }))].map(
            (c) => (
              <button
                key={c._id}
                type="button"
                onClick={() => setCategory(c._id)}
                aria-pressed={category === c._id}
                className={`min-h-[64px] rounded-xl px-3 text-left text-base font-semibold leading-tight ${
                  category === c._id ? "bg-orange-600 text-white" : "bg-slate-50 text-slate-800 active:bg-slate-100"
                }`}
              >
                {c.label}
              </button>
            ),
          )}
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-6 sm:p-4">
          {shown.map(({ category: c, foods }) => (
            <section key={c._id} className="mb-6">
              <h2 className="mb-3 text-2xl font-bold text-slate-900">{tr(c, lang, "name")}</h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {foods.map((food) => {
                  const qty = qtyOf(food._id);
                  return (
                    <button
                      key={food._id}
                      type="button"
                      onClick={() => pick(food)}
                      className={`relative flex flex-col overflow-hidden rounded-2xl border-2 bg-white text-left shadow-card transition active:scale-[0.98] ${
                        flash === food._id ? "border-green-500" : qty > 0 ? "border-orange-400" : "border-transparent"
                      }`}
                    >
                      <span className="flex aspect-[4/3] w-full items-center justify-center bg-slate-100">
                        {food.imageUrl ? (
                          <img src={food.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <UtensilsCrossed size={40} className="text-slate-300" aria-hidden="true" />
                        )}
                      </span>
                      <span className="flex flex-1 flex-col gap-1 p-3">
                        <span className="flex items-start gap-1.5">
                          <span className="mt-1 shrink-0">
                            <FoodTypeIcon type={food.foodType} size={14} />
                          </span>
                          <span className="line-clamp-2 text-base font-semibold leading-snug text-slate-900">
                            {tr(food, lang, "name")}
                          </span>
                        </span>
                        <span className="mt-auto flex items-center justify-between pt-1">
                          <span className="text-lg font-bold text-slate-900">{rupees(food.price)}</span>
                          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-600 text-white">
                            <Plus size={22} aria-hidden="true" />
                          </span>
                        </span>
                      </span>
                      {qty > 0 && (
                        <span className="absolute top-2 right-2 flex h-8 min-w-8 items-center justify-center rounded-full bg-orange-600 px-2 text-sm font-bold text-white shadow">
                          {qty}
                        </span>
                      )}
                      {flash === food._id && (
                        <span className="absolute inset-x-0 top-2 mx-auto w-fit rounded-full bg-green-600 px-3 py-1 text-sm font-semibold text-white">
                          {kt(lang, "added")}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
      <div className="shrink-0 border-t border-slate-200 bg-white p-3">
        <button
          type="button"
          onClick={onReview}
          disabled={count === 0}
          className="flex min-h-[72px] w-full items-center justify-between gap-3 rounded-2xl bg-orange-600 px-6 text-xl font-bold text-white disabled:bg-slate-300"
        >
          <span className="flex items-center gap-3">
            <ShoppingBag size={26} aria-hidden="true" />
            {count === 0 ? kt(lang, "emptyOrder") : count === 1 ? kt(lang, "item") : kt(lang, "items", { n: count })}
          </span>
          {count > 0 && (
            <span className="flex items-center gap-3">
              {rupees(cartTotal(cart))}
              <span className="rounded-xl bg-white/20 px-4 py-2 text-lg">{kt(lang, "viewOrder")}</span>
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
