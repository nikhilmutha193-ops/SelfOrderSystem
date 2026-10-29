import { Minus, Plus, Trash2 } from "lucide-react";

import { PairingRow } from "../../../components/MenuSuggestions";
import { tr, type Lang } from "../../../lib/i18n";
import type { CartLine, MenuFoodItem } from "../../../lib/types";
import { cartTotal } from "../cart";
import { kt, rupees } from "../strings";

/** The order before paying: change quantities, add a suggested side, then continue to pay. */
export function KioskReview({
  lang,
  cart,
  foodById,
  suggestions,
  busy,
  error,
  onQuantity,
  onPick,
  onBack,
  onContinue,
}: {
  lang: Lang;
  cart: CartLine[];
  foodById: Map<string, MenuFoodItem>;
  suggestions: MenuFoodItem[];
  busy: boolean;
  error: string | null;
  onQuantity: (lineId: string, delta: number) => void;
  onPick: (food: MenuFoodItem) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          <h2 className="text-3xl font-bold text-slate-900">{kt(lang, "yourOrder")}</h2>
          {cart.length === 0 && <p className="py-10 text-center text-xl text-slate-500">{kt(lang, "emptyOrder")}</p>}
          <ul className="flex flex-col gap-3">
            {cart.map((line) => {
              const food = foodById.get(line.foodItemId);
              const extras = [...(line.modifiers?.map((m) => m.label) ?? []), line.isJain ? "Jain" : "", line.note ?? ""]
                .filter(Boolean)
                .join(", ");
              return (
                <li key={line.lineId} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-card">
                  {food?.imageUrl ? (
                    <img src={food.imageUrl} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <span className="h-20 w-20 shrink-0 rounded-xl bg-slate-100" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-semibold text-slate-900">{food ? tr(food, lang, "name") : line.name}</p>
                    {extras && <p className="text-sm text-slate-500">{extras}</p>}
                    <p className="text-base font-bold text-slate-900">{rupees(line.price * line.quantity)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      aria-label={line.quantity === 1 ? "Remove" : "One less"}
                      onClick={() => onQuantity(line.lineId, -1)}
                      className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-800 active:bg-slate-200"
                    >
                      {line.quantity === 1 ? <Trash2 size={22} aria-hidden="true" /> : <Minus size={22} aria-hidden="true" />}
                    </button>
                    <span className="w-8 text-center text-2xl font-bold tabular-nums">{line.quantity}</span>
                    <button
                      type="button"
                      aria-label="One more"
                      onClick={() => onQuantity(line.lineId, 1)}
                      className="flex h-14 w-14 items-center justify-center rounded-full bg-orange-600 text-white active:bg-orange-700"
                    >
                      <Plus size={22} aria-hidden="true" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {suggestions.length > 0 && (
            <PairingRow foods={suggestions} lang={lang} onAdd={onPick} onCustomize={onPick} title={kt(lang, "goesWell")} />
          )}
        </div>
      </div>
      <div className="shrink-0 border-t border-slate-200 bg-white p-3">
        <div className="mx-auto flex max-w-3xl flex-col gap-2">
          <div className="flex items-baseline justify-between px-1">
            <span className="text-xl font-semibold text-slate-700">{kt(lang, "total")}</span>
            <span className="text-3xl font-bold text-slate-900">{rupees(cartTotal(cart))}</span>
          </div>
          <p className="px-1 text-sm text-slate-500">{kt(lang, "taxNote")}</p>
          {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-base font-medium text-red-700">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onBack}
              className="min-h-[72px] rounded-2xl border-2 border-slate-300 bg-white text-xl font-bold text-slate-800"
            >
              {kt(lang, "addMore")}
            </button>
            <button
              type="button"
              onClick={onContinue}
              disabled={busy || cart.length === 0}
              className="min-h-[72px] rounded-2xl bg-orange-600 text-xl font-bold text-white disabled:bg-slate-300"
            >
              {busy ? kt(lang, "oneMoment") : kt(lang, "continueToPay")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
