import { downloadExcel, sheet } from "../../shared/export/excel";
import { STOCK_UNIT_OPTIONS } from "./format";

interface SampleRow {
  item: string;
  unit: string;
  quantity: number | null;
  cost: number | null;
  alert: number | null;
  boughtIn: string;
  perPurchase: number | null;
}

// Real-looking rows, one for most types, so the file can be tried straight away. Delete them and add your own.
const SAMPLE: SampleRow[] = [
  { item: "Basmati rice", unit: "kg", quantity: 25, cost: 90, alert: 5, boughtIn: "", perPurchase: null },
  { item: "Refined oil", unit: "L", quantity: 15, cost: 140, alert: 4, boughtIn: "", perPurchase: null },
  { item: "Eggs", unit: "dozen", quantity: 10, cost: 84, alert: 3, boughtIn: "", perPurchase: null },
  { item: "Turmeric powder", unit: "g", quantity: 500, cost: 0.25, alert: 100, boughtIn: "", perPurchase: null },
  { item: "Chocolate syrup", unit: "ml", quantity: 2000, cost: 0.4, alert: 500, boughtIn: "", perPurchase: null },
  { item: "Paper cups", unit: "pcs", quantity: 500, cost: 1.2, alert: 100, boughtIn: "box", perPurchase: 50 },
  { item: "Cheese slices", unit: "packet", quantity: 6, cost: 120, alert: 2, boughtIn: "", perPurchase: null },
  { item: "Soda", unit: "bottle", quantity: 24, cost: 18, alert: 6, boughtIn: "", perPurchase: null },
  { item: "Tomato puree", unit: "can", quantity: 12, cost: 85, alert: 3, boughtIn: "", perPurchase: null },
  { item: "Coriander", unit: "bunch", quantity: 8, cost: 10, alert: 2, boughtIn: "", perPurchase: null },
];

const HOW_TO_FILL = [
  "How to fill the Stock sheet (one row for each stock item):",
  "",
  "Item: the name of the stock item. If it is already in Inventory its stock is added to; if not, it is created.",
  "Counted in: what the item is counted in. Pick a type from the 'Counted in types' sheet. It is needed for a new item; for an item that already exists leave it empty (it can't change once the item has stock).",
  "Quantity: how much to ADD to the stock, in the Counted in type (for kg, 2.5 means two and a half kilos). Leave it empty to create an item with no stock, or to change only its details. It is never negative: use Wastage or Adjust on the item to take stock out.",
  "Cost per unit: the cost of ONE unit of the Counted in type, for example the price of one kg for an item counted in kg. Optional. When given, the item's average cost is worked out again with the new quantity.",
  "Alert below: the stock level at which the item shows as running low. Optional.",
  "Bought in, Units per purchase unit: how the item is bought, for example Bought in 'box' and Units per purchase unit 50 for cups counted in pcs. Optional.",
  "",
  "Rules: the same item twice in one file is skipped (so stock is not added twice). Importing the same file again adds the quantities again. Rows that are empty are ignored. The first row must be the column names.",
];

/** Downloads a sample Excel file: the Stock sheet to fill in, a guide to every Counted in type, and how to fill it. */
export async function downloadStockSample() {
  await downloadExcel("stock-import-sample.xlsx", [
    sheet<SampleRow>({
      name: "Stock",
      columns: [
        { header: "Item", value: (r) => r.item, width: 26 },
        { header: "Counted in", value: (r) => r.unit, width: 14 },
        { header: "Quantity", value: (r) => r.quantity, width: 11 },
        { header: "Cost per unit", value: (r) => r.cost, width: 14 },
        { header: "Alert below", value: (r) => r.alert, width: 12 },
        { header: "Bought in", value: (r) => r.boughtIn, width: 12 },
        { header: "Units per purchase unit", value: (r) => r.perPurchase, width: 22 },
      ],
      rows: SAMPLE,
    }),
    sheet({
      name: "Counted in types",
      columns: [
        { header: "Type", value: (u: (typeof STOCK_UNIT_OPTIONS)[number]) => u.label, width: 20 },
        { header: "Group", value: (u) => u.group, width: 10 },
        { header: "Use it for", value: (u) => u.means, width: 42 },
        { header: "Example (item, quantity)", value: (u) => u.example, width: 30 },
        { header: "You can write", value: (u) => u.words, width: 38 },
      ],
      rows: STOCK_UNIT_OPTIONS,
    }),
    sheet({
      name: "How to fill",
      columns: [{ header: "Instructions", value: (line: string) => line, width: 140 }],
      rows: HOW_TO_FILL,
    }),
  ]);
}
