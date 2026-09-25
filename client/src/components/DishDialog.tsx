import { useEffect, useMemo, useState } from "react";

import { tr, type Lang } from "../lib/i18n";
import type { MenuFoodItem, SelectedModifier } from "../lib/types";
import { BestsellerTag, FoodTypeIcon, RatingChip } from "./FoodBadges";

export interface DishAddPayload {
  quantity: number;
  note: string;
  modifiers: SelectedModifier[];
}

export default function DishDialog({
  food,
  lang = "en",
  onClose,
  onAdd,
}: {
  food: MenuFoodItem | null;
  lang?: Lang;
  onClose: () => void;
  onAdd: (food: MenuFoodItem, payload: DishAddPayload) => void;
}) {
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  // For single groups the value is one label; for multi it's a set of labels.
  const [single, setSingle] = useState<Record<string, string>>({});
  const [multi, setMulti] = useState<Record<string, Set<string>>>({});

  const groups = useMemo(() => food?.modifierGroups ?? [], [food]);

  // Reset selections whenever a new dish opens; default required single-groups to their first option.
  useEffect(() => {
    if (!food) return;
    setQty(1);
    setNote("");
    const s: Record<string, string> = {};
    for (const g of food.modifierGroups ?? []) {
      if (g.type === "single" && g.required && g.options[0]) s[g.name] = g.options[0].label;
    }
    setSingle(s);
    setMulti({});
  }, [food]);

  useEffect(() => {
    if (!food) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [food, onClose]);

  if (!food) return null;

  const selected: SelectedModifier[] = [];
  for (const g of groups) {
    if (g.type === "single") {
      const label = single[g.name];
      const opt = g.options.find((o) => o.label === label);
      if (opt) selected.push({ groupName: g.name, label: opt.label, priceDelta: opt.priceDelta });
    } else {
      for (const label of multi[g.name] ?? []) {
        const opt = g.options.find((o) => o.label === label);
        if (opt) selected.push({ groupName: g.name, label: opt.label, priceDelta: opt.priceDelta });
      }
    }
  }
  const unitPrice = food.price + selected.reduce((s, m) => s + m.priceDelta, 0);
  const missingRequired = groups.some((g) => g.required && g.type === "single" && !single[g.name]);

  function toggleMulti(group: string, label: string) {
    setMulti((prev) => {
      const set = new Set(prev[group] ?? []);
      if (set.has(label)) set.delete(label);
      else set.add(label);
      return { ...prev, [group]: set };
    });
  }

  function add() {
    if (!food || missingRequired) return;
    onAdd(food, { quantity: qty, note: note.trim(), modifiers: selected });
    onClose();
  }

  const name = tr(food, lang, "name");
  const description = tr(food, lang, "description");

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={name}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          {food.imageUrl ? (
            <img src={food.imageUrl} alt={name} className="h-52 w-full rounded-t-2xl object-cover" />
          ) : (
            <div className="flex h-36 w-full items-center justify-center rounded-t-2xl bg-gradient-to-br from-orange-100 to-amber-50 text-5xl font-bold text-orange-300">
              {name.charAt(0).toUpperCase()}
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white/90 text-lg text-slate-700 shadow-md hover:bg-white"
          >
            ✕
          </button>
        </div>

        <div className="p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <FoodTypeIcon type={food.foodType} />
            <RatingChip rating={food.guestRating ?? food.rating} />
            {food.reviewCount ? <span className="text-xs text-slate-400">({food.reviewCount})</span> : null}
            {food.isBestseller && <BestsellerTag emoji={food.bestsellerEmoji} />}
          </div>

          <h2 className="mt-2 text-lg font-bold leading-snug text-slate-900">{name}</h2>
          <p className="mt-1 text-base font-bold text-slate-800">₹{food.price.toFixed(2)}</p>
          {description ? (
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-600">{description}</p>
          ) : null}

          {groups.map((g) => (
            <div key={g.name} className="mt-4">
              <p className="mb-1.5 text-sm font-semibold text-slate-800">
                {g.name}
                {g.required && <span className="ml-1 text-xs font-normal text-red-500">required</span>}
                {g.type === "multi" && <span className="ml-1 text-xs font-normal text-slate-400">choose any</span>}
              </p>
              <div className="flex flex-col gap-1.5">
                {g.options.map((o) => {
                  const checked =
                    g.type === "single" ? single[g.name] === o.label : (multi[g.name]?.has(o.label) ?? false);
                  return (
                    <label
                      key={o.label}
                      className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2 text-sm ${
                        checked ? "border-orange-500 bg-orange-50" : "border-slate-200"
                      }`}
                    >
                      <span className="flex items-center gap-2 text-slate-700">
                        <input
                          type={g.type === "single" ? "radio" : "checkbox"}
                          name={`grp-${g.name}`}
                          checked={checked}
                          onChange={() =>
                            g.type === "single"
                              ? setSingle((p) => ({ ...p, [g.name]: o.label }))
                              : toggleMulti(g.name, o.label)
                          }
                        />
                        {o.label}
                      </span>
                      {o.priceDelta !== 0 && (
                        <span className="text-slate-500">
                          {o.priceDelta > 0 ? "+" : ""}₹{o.priceDelta.toFixed(2)}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}

          <label className="mt-4 block text-sm font-semibold text-slate-800">
            Note for the kitchen <span className="font-normal text-slate-400">(optional)</span>
            <textarea
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              rows={2}
              maxLength={200}
              placeholder="e.g. no onions, less spicy"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>

          <div className="mt-5 flex items-center gap-3">
            <div className="flex h-12 items-center justify-between rounded-xl border border-slate-300 px-1">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
                className="flex h-full w-9 items-center justify-center text-xl font-bold text-slate-600"
              >
                −
              </button>
              <span className="w-6 text-center text-base font-bold tabular-nums">{qty}</span>
              <button
                onClick={() => setQty((q) => q + 1)}
                aria-label="Increase quantity"
                className="flex h-full w-9 items-center justify-center text-xl font-bold text-slate-600"
              >
                +
              </button>
            </div>
            <button
              onClick={add}
              disabled={missingRequired}
              className="flex h-12 flex-1 items-center justify-center rounded-xl bg-orange-600 text-base font-bold tracking-wide text-white shadow-sm hover:bg-orange-700 disabled:opacity-50"
            >
              Add · ₹{(unitPrice * qty).toFixed(2)}
            </button>
          </div>
          {missingRequired && <p className="mt-2 text-xs text-red-500">Please choose the required options above.</p>}
        </div>
      </div>
    </div>
  );
}
