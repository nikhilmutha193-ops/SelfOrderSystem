import type { StockItem, StockUnit } from "../../lib/types";

/** What an item can be counted in: the word in the list, the short form next to numbers, how it is usually bought,
 * and what to say about it in the guide (the dialog and the sample file). `words` are what the import file may say. */
export const STOCK_UNIT_OPTIONS: {
  value: StockUnit;
  label: string;
  short: string;
  group: "Weight" | "Volume" | "Count";
  purchaseUnit: string;
  purchaseFactor: number;
  means: string;
  example: string;
  words: string;
}[] = [
  { value: "g", label: "grams (g)", short: "g", group: "Weight", purchaseUnit: "kg", purchaseFactor: 1000, means: "Small weights: spices, flour, sugar", example: "Turmeric powder, 500 g", words: "g, gm, gram, grams" },
  { value: "kg", label: "kilograms (kg)", short: "kg", group: "Weight", purchaseUnit: "", purchaseFactor: 1, means: "Bigger weights: rice, vegetables, meat", example: "Basmati rice, 25 kg", words: "kg, kilo, kilogram, kilograms" },
  { value: "ml", label: "millilitres (ml)", short: "ml", group: "Volume", purchaseUnit: "L", purchaseFactor: 1000, means: "Small volumes: sauces, syrups, milk", example: "Chocolate syrup, 2000 ml", words: "ml, millilitre, millilitres" },
  { value: "l", label: "litres (L)", short: "L", group: "Volume", purchaseUnit: "", purchaseFactor: 1, means: "Bigger volumes: oil, milk, water", example: "Refined oil, 15 L", words: "l, ltr, litre, litres, liter" },
  { value: "pcs", label: "pieces", short: "pcs", group: "Count", purchaseUnit: "", purchaseFactor: 1, means: "Single things counted one by one", example: "Paper cups, 500 pcs", words: "pcs, pc, piece, pieces, nos" },
  { value: "dozen", label: "dozens", short: "dozen", group: "Count", purchaseUnit: "", purchaseFactor: 1, means: "Things bought in twelves: eggs, bananas", example: "Eggs, 10 dozen", words: "dozen, dozens, doz, dz" },
  { value: "packet", label: "packets", short: "pkt", group: "Count", purchaseUnit: "", purchaseFactor: 1, means: "Sealed packets or packs", example: "Cheese slices, 6 packets", words: "packet, packets, pkt, pack" },
  { value: "box", label: "boxes", short: "box", group: "Count", purchaseUnit: "", purchaseFactor: 1, means: "Boxes or cartons", example: "Straws, 4 boxes", words: "box, boxes" },
  { value: "bottle", label: "bottles", short: "btl", group: "Count", purchaseUnit: "", purchaseFactor: 1, means: "Bottles", example: "Soda, 24 bottles", words: "bottle, bottles, btl" },
  { value: "can", label: "cans / tins", short: "can", group: "Count", purchaseUnit: "", purchaseFactor: 1, means: "Cans and tins", example: "Tomato puree, 12 cans", words: "can, cans, tin, tins" },
  { value: "tray", label: "trays", short: "tray", group: "Count", purchaseUnit: "", purchaseFactor: 1, means: "Trays: bakery, eggs", example: "Bun trays, 10 trays", words: "tray, trays" },
  { value: "bunch", label: "bunches", short: "bunch", group: "Count", purchaseUnit: "", purchaseFactor: 1, means: "Leaves and herbs sold in bunches", example: "Coriander, 8 bunches", words: "bunch, bunches" },
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
