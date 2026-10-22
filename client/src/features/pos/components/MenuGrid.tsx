import { FoodTypeIcon } from "../../../components/FoodBadges";
import type { PosMenuItem } from "../../../lib/types";

export function MenuGrid({
  categories,
  category,
  onCategory,
  items,
  searching,
  quantity,
  onQuantity,
  onPick,
}: {
  categories: { _id: string; name: string }[];
  category: string;
  onCategory: (id: string) => void;
  items: PosMenuItem[];
  searching: boolean;
  quantity: string;
  onQuantity: (value: string) => void;
  onPick: (item: PosMenuItem) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2">
        {[{ _id: "all", name: "All" }, ...categories].map((c) => (
          <button
            key={c._id}
            type="button"
            onClick={() => onCategory(c._id)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
              category === c._id && !searching
                ? "bg-orange-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {c.name}
          </button>
        ))}
        {quantity && (
          <button
            type="button"
            onClick={() => onQuantity("")}
            title="Quantity for the next dish - tap to clear"
            className="ml-auto shrink-0 rounded-full bg-slate-900 px-3 py-2 font-mono text-sm font-semibold text-white"
          >
            ×{quantity} ✕
          </button>
        )}
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-2">
            {items.map((item) => (
              <button
                key={item._id}
                type="button"
                data-item={item.name}
                onClick={() => onPick(item)}
                className="flex min-h-[84px] flex-col justify-between rounded-lg border border-slate-200 bg-white p-2.5 text-left shadow-sm transition hover:border-orange-400 active:scale-[0.97]"
              >
                <span className="flex items-start gap-1.5">
                  {item.foodType && <FoodTypeIcon type={item.foodType} />}
                  <span className="line-clamp-2 text-sm font-medium leading-tight text-slate-800">{item.name}</span>
                </span>
                <span className="mt-1 flex items-end justify-between text-xs">
                  <span className="font-semibold tabular-nums text-slate-900">₹{item.price.toFixed(0)}</span>
                  {item.shortCode && <span className="font-mono text-slate-400">{item.shortCode}</span>}
                </span>
                {item.modifierGroups.length > 0 && <span className="text-[10px] text-orange-600">Options</span>}
                {(item.components ?? []).length > 0 && (
                  <span className="truncate text-[10px] text-slate-500">
                    Combo: {item.components!.map((p) => p.name).join(", ")}
                  </span>
                )}
              </button>
            ))}
          </div>
          {items.length === 0 && (
            <p className="p-6 text-center text-sm text-slate-500">
              {searching ? "No dish matches that name or code." : "No dishes in this category."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
