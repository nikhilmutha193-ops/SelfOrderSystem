import type { StockItem } from "../../lib/types";
import { downloadExcel, excelFileName, MONEY, sheet } from "../../shared/export/excel";
import { unitShort } from "./format";

const byName = (a: StockItem, b: StockItem) => a.name.localeCompare(b.name);

/**
 * The stock as it is now: the quantity on hand of every item, with its cost and value. The quantity column is called
 * "On hand" (not "Quantity") on purpose, so this file is not mistaken for a stock import, which would add it again.
 */
export async function downloadCurrentStock(items: StockItem[]) {
  await downloadExcel(excelFileName("current-stock"), [
    sheet<StockItem>({
      name: "Current stock",
      columns: [
        { header: "Item", value: (i) => i.name, width: 28 },
        { header: "Counted in", value: (i) => unitShort(i.unit), width: 12 },
        { header: "On hand", value: (i) => i.onHand, width: 12 },
        { header: "Cost per unit", value: (i) => i.avgCost, width: 14, format: MONEY },
        { header: "Stock value", value: (i) => i.value, width: 14, format: MONEY },
        { header: "Alert below", value: (i) => i.reorderLevel, width: 12 },
        { header: "Status", value: (i) => (!i.isActive ? "Inactive" : i.low ? "Running low" : "OK"), width: 14 },
        { header: "Bought in", value: (i) => i.purchaseUnit, width: 12 },
        { header: "Units per purchase unit", value: (i) => i.purchaseFactor, width: 22 },
      ],
      rows: [...items].sort(byName),
    }),
  ]);
}

const HOW_TO_COUNT = [
  "How to use this count sheet:",
  "",
  "1. Count the stock and type what you find in the Counted quantity column, in the same unit as Counted in (for kg, 2.5 means two and a half kilos).",
  "2. Leave Counted quantity empty for any item you did not count: it is left as it is.",
  "3. Do not change the Item names, and do not add new items (use Import Excel on the Stock tab for that).",
  "4. In Inventory, go to Counts, press Import counted sheet and choose this file. You see every difference before anything is saved.",
  "",
  "System stock is the stock when this sheet was made. If sales used some stock before you import, the difference is worked out against the stock at that moment.",
];

/** The count sheet: every active item with its stock now, and an empty Counted quantity column to fill in. */
export async function downloadCountSheet(items: StockItem[]) {
  await downloadExcel(excelFileName("stock-count-sheet"), [
    sheet<StockItem>({
      name: "Count sheet",
      columns: [
        { header: "Item", value: (i) => i.name, width: 28 },
        { header: "Counted in", value: (i) => unitShort(i.unit), width: 12 },
        { header: "System stock", value: (i) => i.onHand, width: 14 },
        { header: "Counted quantity", value: () => null, width: 18 },
      ],
      rows: items.filter((i) => i.isActive).sort(byName),
    }),
    sheet({
      name: "How to count",
      columns: [{ header: "Instructions", value: (line: string) => line, width: 130 }],
      rows: HOW_TO_COUNT,
    }),
  ]);
}
