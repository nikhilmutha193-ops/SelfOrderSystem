import { Image as ImageIcon, ImageOff, SlidersHorizontal, ZoomIn, ZoomOut } from "lucide-react";
import { useState } from "react";

import { FoodTypeIcon } from "../../../components/FoodBadges";
import type { PosMenuItem } from "../../../lib/types";

const IMAGES_KEY = "selforder_pos_menu_images";
const SIZE_KEY = "selforder_pos_menu_size";

/** How big the dish tiles are: the narrowest a tile gets (with and without a picture) and its text and picture sizes. */
const SIZES = [
  { name: "Small", minWith: 210, minWithout: 150, thumb: "h-16 w-16", tile: "min-h-[84px]", inner: "min-h-[64px]", title: "text-sm", price: "text-xs" },
  { name: "Medium", minWith: 260, minWithout: 190, thumb: "h-20 w-20", tile: "min-h-[104px]", inner: "min-h-[80px]", title: "text-base", price: "text-sm" },
  { name: "Large", minWith: 320, minWithout: 240, thumb: "h-24 w-24", tile: "min-h-[124px]", inner: "min-h-[96px]", title: "text-lg", price: "text-base" },
  { name: "Extra large", minWith: 400, minWithout: 300, thumb: "h-32 w-32", tile: "min-h-[150px]", inner: "min-h-[128px]", title: "text-xl", price: "text-lg" },
] as const;

// Tile size, remembered on this device like the pictures switch.
function readSize(): number {
  try {
    const n = Number(localStorage.getItem(SIZE_KEY));
    return Number.isInteger(n) && n >= 0 && n < SIZES.length ? n : 0;
  } catch {
    return 0;
  }
}

// Pictures on or off, remembered on this device (the grid is faster to scan without them on a small screen).
function readShowImages(): boolean {
  try {
    return localStorage.getItem(IMAGES_KEY) !== "0";
  } catch {
    return true;
  }
}

function Thumb({ item, className }: { item: PosMenuItem; className: string }) {
  const [failed, setFailed] = useState(false);
  if (item.imageUrl && !failed) {
    return (
      <img
        src={item.imageUrl}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={`${className} shrink-0 rounded-md object-cover`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`flex ${className} shrink-0 items-center justify-center rounded-md bg-slate-100 text-lg font-semibold text-slate-400`}
    >
      {item.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function MenuGrid({
  categories,
  category,
  onCategory,
  items,
  searching,
  quantity,
  onQuantity,
  onPick,
  onCustomize,
}: {
  categories: { _id: string; name: string }[];
  category: string;
  onCategory: (id: string) => void;
  items: PosMenuItem[];
  searching: boolean;
  quantity: string;
  onQuantity: (value: string) => void;
  onPick: (item: PosMenuItem) => void;
  /** Opens the dish dialog (Regular or Jain, spice, comment) for any dish, not only ones with options. */
  onCustomize?: (item: PosMenuItem) => void;
}) {
  const [showImages, setShowImages] = useState(readShowImages);
  const [size, setSize] = useState(readSize);
  const look = SIZES[size];
  function changeSize(next: number) {
    const clamped = Math.min(SIZES.length - 1, Math.max(0, next));
    setSize(clamped);
    try {
      localStorage.setItem(SIZE_KEY, String(clamped));
    } catch {
      // private mode: the choice just lasts until the page is reloaded
    }
  }
  function toggleImages() {
    setShowImages((on) => {
      try {
        localStorage.setItem(IMAGES_KEY, on ? "0" : "1");
      } catch {
        // private mode: the choice just lasts until the page is reloaded
      }
      return !on;
    });
  }
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
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {quantity && (
            <button
              type="button"
              onClick={() => onQuantity("")}
              title="Quantity for the next dish - tap to clear"
              className="shrink-0 rounded-full bg-slate-900 px-3 py-2 font-mono text-sm font-semibold text-white"
            >
              ×{quantity} ✕
            </button>
          )}
          <span className="flex items-center rounded-full bg-slate-100" role="group" aria-label="Dish tile size">
            <button
              type="button"
              onClick={() => changeSize(size - 1)}
              disabled={size === 0}
              title="Smaller dish tiles"
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 disabled:opacity-30"
            >
              <ZoomOut size={18} aria-hidden="true" />
              <span className="sr-only">Smaller dish tiles</span>
            </button>
            <span className="min-w-[3.5rem] text-center text-[11px] font-semibold text-slate-600" aria-live="polite">
              {look.name}
            </span>
            <button
              type="button"
              onClick={() => changeSize(size + 1)}
              disabled={size === SIZES.length - 1}
              title="Bigger dish tiles"
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 disabled:opacity-30"
            >
              <ZoomIn size={18} aria-hidden="true" />
              <span className="sr-only">Bigger dish tiles</span>
            </button>
          </span>
          <button
            type="button"
            onClick={toggleImages}
            aria-pressed={showImages}
            title={showImages ? "Hide dish pictures" : "Show dish pictures"}
            className={`flex h-9 w-9 items-center justify-center rounded-full ${
              showImages ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            {showImages ? <ImageIcon size={18} aria-hidden="true" /> : <ImageOff size={18} aria-hidden="true" />}
            <span className="sr-only">{showImages ? "Hide dish pictures" : "Show dish pictures"}</span>
          </button>
        </span>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(${showImages ? look.minWith : look.minWithout}px, 1fr))`,
            }}
          >
            {items.map((item) => (
              <div
                key={item._id}
                className={`flex ${look.tile} overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:border-orange-400`}
              >
                <button
                  type="button"
                  data-item={item.name}
                  onClick={() => onPick(item)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 p-2.5 text-left active:bg-orange-50"
                >
                  {showImages && <Thumb item={item} className={look.thumb} />}
                  <span className={`flex ${look.inner} min-w-0 flex-1 flex-col justify-between`}>
                  <span className="flex items-start gap-1.5">
                    {item.foodType && <FoodTypeIcon type={item.foodType} />}
                    <span className={`line-clamp-2 min-w-0 ${look.title} leading-tight font-medium break-words text-slate-800`}>
                      {item.name}
                    </span>
                  </span>
                  <span className={`mt-1 flex items-end justify-between gap-1 ${look.price}`}>
                    <span className="font-semibold text-slate-900 tabular-nums">₹{item.price.toFixed(0)}</span>
                    {item.shortCode && <span className="font-mono text-slate-400">{item.shortCode}</span>}
                  </span>
                  {item.modifierGroups.length > 0 && <span className="text-[10px] text-orange-600">Options</span>}
                  {(item.components ?? []).length > 0 && (
                    <span className="truncate text-[10px] text-slate-500">
                      Combo: {item.components!.map((p) => p.name).join(", ")}
                    </span>
                  )}
                  </span>
                </button>
                {onCustomize && (
                  <button
                    type="button"
                    aria-label={`Customize ${item.name}`}
                    title="Customize: Regular or Jain, spice, comment"
                    onClick={() => onCustomize(item)}
                    className="flex w-9 shrink-0 items-center justify-center border-l border-slate-100 bg-slate-50 text-slate-500 hover:bg-orange-50 hover:text-orange-600 active:bg-orange-100"
                  >
                    <SlidersHorizontal size={17} aria-hidden="true" />
                  </button>
                )}
              </div>
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
