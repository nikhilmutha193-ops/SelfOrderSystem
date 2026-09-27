import type { StockItem, StockUnit } from "../../lib/types";

const UNIT: Record<StockUnit, string> = { g: "g", ml: "ml", pcs: "pcs" };

export function qty(n: number, unit: StockUnit) {
  return `${Number(n.toFixed(3)).toLocaleString()} ${UNIT[unit]}`;
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
