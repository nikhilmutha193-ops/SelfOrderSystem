import type { StockItem, StockUnit } from "../../lib/types";

/** What an item can be counted in: the word in the list, the short form next to numbers, and how it is usually bought. */
export const STOCK_UNIT_OPTIONS: {
  value: StockUnit;
  label: string;
  short: string;
  group: "Weight" | "Volume" | "Count";
  purchaseUnit: string;
  purchaseFactor: number;
}[] = [
  { value: "g", label: "grams (g)", short: "g", group: "Weight", purchaseUnit: "kg", purchaseFactor: 1000 },
  { value: "kg", label: "kilograms (kg)", short: "kg", group: "Weight", purchaseUnit: "", purchaseFactor: 1 },
  { value: "ml", label: "millilitres (ml)", short: "ml", group: "Volume", purchaseUnit: "L", purchaseFactor: 1000 },
  { value: "l", label: "litres (L)", short: "L", group: "Volume", purchaseUnit: "", purchaseFactor: 1 },
  { value: "pcs", label: "pieces", short: "pcs", group: "Count", purchaseUnit: "", purchaseFactor: 1 },
  { value: "dozen", label: "dozens", short: "dozen", group: "Count", purchaseUnit: "", purchaseFactor: 1 },
  { value: "packet", label: "packets", short: "pkt", group: "Count", purchaseUnit: "", purchaseFactor: 1 },
  { value: "box", label: "boxes", short: "box", group: "Count", purchaseUnit: "", purchaseFactor: 1 },
  { value: "bottle", label: "bottles", short: "btl", group: "Count", purchaseUnit: "", purchaseFactor: 1 },
  { value: "can", label: "cans / tins", short: "can", group: "Count", purchaseUnit: "", purchaseFactor: 1 },
  { value: "tray", label: "trays", short: "tray", group: "Count", purchaseUnit: "", purchaseFactor: 1 },
  { value: "bunch", label: "bunches", short: "bunch", group: "Count", purchaseUnit: "", purchaseFactor: 1 },
];

/** The short form of a unit, for next to a number. */
export function unitShort(unit: StockUnit | string): string {
  return STOCK_UNIT_OPTIONS.find((u) => u.value === unit)?.short ?? String(unit);
}

export function qty(n: number, unit: StockUnit) {
  return `${Number(n.toFixed(3)).toLocaleString()} ${unitShort(unit)}`;
}

export function inPurchaseUnits(n: number, item: Pick<StockItem, "purchaseFactor" | "purchaseUnit">) {
  if (!item.purchaseUnit || item.purchaseFactor <= 1) return null;
  return `${Number((n / item.purchaseFactor).toFixed(2)).toLocaleString()} ${item.purchaseUnit}`;
}

export function rupees(n: number) {
  return `₹${n.toFixed(2)}`;
}

export function isoDate(date: Date) {
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function daysAgo(days: number) {
  return isoDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
}

export const MOVEMENT_LABEL = {
  opening: "Opening stock",
  purchase: "Purchase",
  consumption: "Used in orders",
  reversal: "Returned (cancelled)",
  wastage: "Wastage",
  adjustment: "Adjustment",
} as const;
