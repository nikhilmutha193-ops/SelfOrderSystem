import { Flame, Plus, Sparkles } from "lucide-react";

import { tr, type Lang } from "../lib/i18n";
import type { MenuFoodItem } from "../lib/types";
import { FoodTypeIcon } from "./FoodBadges";

function Thumb({ food, name, size }: { food: MenuFoodItem; name: string; size: "md" | "sm" }) {
  const box = size === "md" ? "h-24 w-full" : "h-12 w-12";
  return food.imageUrl ? (
    <img src={food.imageUrl} alt="" loading="lazy" className={`${box} shrink-0 rounded-xl object-cover`} />
  ) : (
    <div
      className={`${box} flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-100 to-amber-50 text-lg font-bold text-orange-400`}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export function PopularStrip({
  foods,
  lang,
  cartQty,
  onAdd,
  onOpen,
}: {
  foods: MenuFoodItem[];
  lang: Lang;
  cartQty: (foodId: string) => number;
  onAdd: (food: MenuFoodItem) => void;
  onOpen: (food: MenuFoodItem) => void;
}) {
  if (foods.length === 0) return null;
  return (
    <section aria-label="Popular right now" className="pt-2">
      <h2 className="mb-2 flex items-center gap-1.5 px-4 text-base font-bold tracking-tight text-slate-900">
        <Flame size={18} className="text-orange-600" aria-hidden="true" />
        Popular right now
      </h2>
      <div className="flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
        {foods.map((food, index) => {
          const name = tr(food, lang, "name");
          const qty = cartQty(food._id);
          return (
            <div
              key={food._id}
              className="relative flex w-36 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <button type="button" onClick={() => onOpen(food)} className="text-left" aria-label={`View ${name}`}>
                <div className="relative p-1.5 pb-0">
                  <Thumb food={food} name={name} size="md" />
                  {index < 3 && (
                    <span className="absolute top-3 left-3 rounded-md bg-slate-900/85 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      #{index + 1}
                    </span>
                  )}
                </div>
                <div className="px-2.5 pt-2">
                  <p className="flex items-center gap-1 text-[13px] leading-snug font-semibold text-slate-900">
                    <FoodTypeIcon type={food.foodType} size={10} />
                    <span className="line-clamp-1">{name}</span>
                  </p>
                  <p className="text-sm font-bold text-slate-800">₹{food.price.toFixed(0)}</p>
                </div>
              </button>
              <div className="px-2.5 pt-1.5 pb-2.5">
                <button
                  type="button"
                  onClick={() => onAdd(food)}
                  className={`flex h-9 w-full items-center justify-center gap-1 rounded-xl text-xs font-bold tracking-wide ${
                    qty > 0 ? "bg-orange-600 text-white" : "border border-orange-600 text-orange-600 hover:bg-orange-50"
                  }`}
                >
                  {qty > 0 ? (
                    `${qty} in cart · +1`
                  ) : (
                    <>
                      <Plus size={14} aria-hidden="true" />
                      ADD
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function PairingRow({
  foods,
  lang,
  onAdd,
  title = "Goes well with your order",
}: {
  foods: MenuFoodItem[];
  lang: Lang;
  onAdd: (food: MenuFoodItem) => void;
  title?: string;
}) {
  if (foods.length === 0) return null;
  return (
    <section aria-label={title} className="rounded-xl border border-orange-200 bg-orange-50/60 p-2.5">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-orange-800">
        <Sparkles size={14} aria-hidden="true" />
        {title}
      </p>
      <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
        {foods.map((food) => {
          const name = tr(food, lang, "name");
          return (
            <button
              key={food._id}
              type="button"
              onClick={() => onAdd(food)}
              aria-label={`Add ${name}`}
              className="flex min-w-[11rem] shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white p-1.5 pr-2 text-left shadow-sm active:scale-[0.98]"
            >
              <Thumb food={food} name={name} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-slate-900">{name}</span>
                <span className="block text-xs font-bold text-slate-700">₹{food.price.toFixed(0)}</span>
              </span>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-600 text-white">
                <Plus size={16} aria-hidden="true" />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
