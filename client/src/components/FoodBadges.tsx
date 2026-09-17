import type { FoodType } from "../lib/types";

const TYPE_COLOR: Record<FoodType, string> = {
  veg: "#16a34a",
  "non-veg": "#b91c1c",
  egg: "#ca8a04",
};

const TYPE_LABEL: Record<FoodType, string> = {
  veg: "Vegetarian",
  "non-veg": "Non-vegetarian",
  egg: "Contains egg",
};

/**
 * The square-with-marker symbol Indian menus use: a dot for veg/egg and a
 * triangle for non-veg, so it reads correctly without colour alone.
 */
export function FoodTypeIcon({ type = "veg", size = 14 }: { type?: FoodType; size?: number }) {
  const color = TYPE_COLOR[type] ?? TYPE_COLOR.veg;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      role="img"
      aria-label={TYPE_LABEL[type] ?? TYPE_LABEL.veg}
      className="shrink-0"
    >
      <rect x="0.75" y="0.75" width="14.5" height="14.5" rx="2.5" fill="white" stroke={color} strokeWidth="1.5" />
      {type === "non-veg" ? (
        <path d="M8 4.2 L12 11.4 L4 11.4 Z" fill={color} />
      ) : (
        <circle cx="8" cy="8" r="3.2" fill={color} />
      )}
    </svg>
  );
}

export function BestsellerTag({ emoji }: { emoji?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
      <span aria-hidden>{emoji || "⭐"}</span> Bestseller
    </span>
  );
}

/** Unrated dishes show "New" - inventing a star score would misrepresent them. */
export function RatingChip({ rating }: { rating?: number }) {
  if (!rating || rating <= 0) {
    return (
      <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
        New
      </span>
    );
  }
  const tone = rating >= 4 ? "bg-green-600" : rating >= 3 ? "bg-lime-600" : "bg-amber-600";
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white ${tone}`}
      aria-label={`Rated ${rating} out of 5`}
    >
      <span aria-hidden>★</span>
      {rating.toFixed(1)}
    </span>
  );
}
