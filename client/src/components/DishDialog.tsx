import { useEffect } from "react";
import { BestsellerTag, FoodTypeIcon, RatingChip } from "./FoodBadges";
import type { MenuFoodItem } from "../lib/types";

/** Full dish view: the card clamps the description to two lines, this shows all of it. */
export default function DishDialog({
  food,
  qty,
  onIncrement,
  onDecrement,
  onClose,
}: {
  food: MenuFoodItem | null;
  qty: number;
  onIncrement: (food: MenuFoodItem) => void;
  onDecrement: (foodItemId: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!food) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // Stop the menu behind the sheet from scrolling under the finger.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [food, onClose]);

  if (!food) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={food.name}
    >
      <div
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          {food.imageUrl ? (
            <img src={food.imageUrl} alt={food.name} className="h-56 w-full rounded-t-2xl object-cover sm:rounded-t-2xl" />
          ) : (
            <div className="flex h-40 w-full items-center justify-center rounded-t-2xl bg-gradient-to-br from-orange-100 to-amber-50 text-5xl font-bold text-orange-300">
              {food.name.charAt(0).toUpperCase()}
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-lg text-slate-700 shadow-md hover:bg-white"
          >
            ✕
          </button>
        </div>

        <div className="p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <FoodTypeIcon type={food.foodType} />
            <RatingChip rating={food.rating} />
            {food.isBestseller && <BestsellerTag emoji={food.bestsellerEmoji} />}
          </div>

          <h2 className="mt-2 text-lg font-bold leading-snug text-slate-900">{food.name}</h2>
          <p className="mt-1 text-base font-bold text-slate-800">₹{food.price.toFixed(2)}</p>

          {food.description ? (
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-600">{food.description}</p>
          ) : (
            <p className="mt-3 text-sm italic text-slate-400">No description for this dish yet.</p>
          )}

          <div className="mt-5">
            {qty === 0 ? (
              <button
                onClick={() => onIncrement(food)}
                className="flex h-12 w-full items-center justify-center rounded-lg bg-orange-600 text-base font-bold tracking-wide text-white shadow-sm hover:bg-orange-700"
              >
                ADD TO ORDER
              </button>
            ) : (
              <div className="flex h-12 w-full items-center justify-between rounded-lg bg-orange-600 px-2 text-white shadow-sm">
                <button
                  onClick={() => onDecrement(food._id)}
                  aria-label={`Remove one ${food.name}`}
                  className="flex h-full w-12 items-center justify-center text-2xl font-bold leading-none"
                >
                  −
                </button>
                <span className="text-base font-bold">{qty} in order</span>
                <button
                  onClick={() => onIncrement(food)}
                  aria-label={`Add one ${food.name}`}
                  className="flex h-full w-12 items-center justify-center text-2xl font-bold leading-none"
                >
                  +
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
