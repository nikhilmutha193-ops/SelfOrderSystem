import { Types } from "mongoose";

import { RequestContext } from "../../core/context";
import { withTransaction } from "../../core/transaction";
import { IStockItem, StockUnit } from "../../models/StockItem";
import { writeAudit } from "../../utils/audit";
import { HttpError } from "../../utils/httpError";
import { InventoryRepository, NewMovement } from "./inventory.repository";
import { StockImportInput } from "./inventory.schema";
import { refreshSoldOut } from "./inventory.service";

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

// ---------------------------------------------------------------------------------------------------------------------
// What the spreadsheet may call its columns, and what a person may type for "Counted in". Keep UNIT_WORDS in step with
// the guide in client/src/features/inventory/format.ts (STOCK_UNIT_OPTIONS.words), which is printed in the sample file.

const COLUMNS: Record<string, string[]> = {
  name: ["item", "item name", "name", "stock item", "stock", "ingredient"],
  unit: ["counted in", "unit", "count in", "counted", "uom"],
  quantity: ["quantity", "qty", "add quantity", "quantity to add", "opening stock", "stock to add", "add"],
  cost: ["cost per unit", "cost", "rate", "price per unit", "unit cost", "cost price"],
  reorder: ["alert below", "reorder level", "low stock alert", "minimum", "min"],
  purchaseUnit: ["bought in", "purchase unit"],
  purchaseFactor: ["units per purchase unit", "per purchase unit", "factor", "purchase factor"],
};

const UNIT_WORDS: Record<StockUnit, string[]> = {
  g: ["g", "gm", "gms", "gram", "grams", "gramme", "grammes"],
  kg: ["kg", "kgs", "kilo", "kilos", "kilogram", "kilograms"],
  ml: ["ml", "millilitre", "millilitres", "milliliter", "milliliters"],
  l: ["l", "lt", "ltr", "ltrs", "litre", "litres", "liter", "liters"],
  pcs: ["pcs", "pc", "piece", "pieces", "no", "nos", "number", "numbers", "unit", "units", "each", "count"],
  dozen: ["dozen", "dozens", "doz", "dz"],
  packet: ["packet", "packets", "pkt", "pkts", "pack", "packs"],
  box: ["box", "boxes"],
  bottle: ["bottle", "bottles", "btl", "btls"],
  can: ["can", "cans", "tin", "tins"],
  tray: ["tray", "trays"],
  bunch: ["bunch", "bunches"],
};

const simplify = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const COLUMN_LOOKUP = new Map<string, string>();
for (const [field, names] of Object.entries(COLUMNS)) for (const n of names) COLUMN_LOOKUP.set(simplify(n), field);
const UNIT_LOOKUP = new Map<string, StockUnit>();
for (const [unit, words] of Object.entries(UNIT_WORDS)) for (const w of words) UNIT_LOOKUP.set(w, unit as StockUnit);

/** "kg", "Kilograms", "litres (L)" and "Pieces" all work. */
export function parseStockUnit(raw: unknown): StockUnit | null {
  const text = simplify(String(raw ?? ""));
  if (!text) return null;
  const direct = UNIT_LOOKUP.get(text.replace(/ /g, ""));
  if (direct) return direct;
  // "grams (g)": try the part in brackets, then the first word.
  const inBrackets = /\(([^)]*)\)/.exec(String(raw))?.[1];
  const fromBrackets = inBrackets ? UNIT_LOOKUP.get(simplify(inBrackets).replace(/ /g, "")) : undefined;
  return fromBrackets ?? UNIT_LOOKUP.get(text.split(" ")[0]) ?? null;
}

const isBlank = (raw: unknown) => raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "");

function asNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const n = Number(raw.replace(/[₹,\s]/g, "").replace(/^rs\.?/i, ""));
  return Number.isFinite(n) ? n : null;
}

/** Buying g in kg or ml in L is so common that a new g or ml item gets it without being asked. */
const DEFAULT_PURCHASE: Partial<Record<StockUnit, { purchaseUnit: string; purchaseFactor: number }>> = {
  g: { purchaseUnit: "kg", purchaseFactor: 1000 },
  ml: { purchaseUnit: "L", purchaseFactor: 1000 },
};

// ---------------------------------------------------------------------------------------------------------------------

type Action = "create" | "add" | "update" | "unchanged" | "error";

export interface StockImportRow {
  row: number;
  name: string;
  unit: StockUnit | null;
  action: Action;
  /** What the row adds to the stock, in the item's own unit (0 when it only changes details). */
  quantity: number;
  /** Stock on hand before and after (existing items; a new item starts at nothing). */
  before: number;
  after: number;
  cost: number | null;
  notes: string[];
  error?: string;
}

interface Planned {
  existing: (IStockItem & { _id: Types.ObjectId }) | null;
  name: string;
  unit: StockUnit;
  quantity: number;
  cost: number | null;
  reorder: number | null;
  purchaseUnit: string | null;
  purchaseFactor: number | null;
}

async function buildPlan(ctx: RequestContext, input: StockImportInput) {
  const repo = new InventoryRepository(ctx.restaurantId);
  const [items, onHand] = await Promise.all([repo.listStockItems(), repo.onHand()]);
  const byName = new Map(items.map((i) => [i.name.trim().toLowerCase(), i as IStockItem & { _id: Types.ObjectId }]));

  const headerField = new Map<string, string>();
  const found = new Set<string>();
  const unknownHeaders: string[] = [];
  for (const header of new Set(input.rows.flatMap((r) => Object.keys(r)))) {
    const field = COLUMN_LOOKUP.get(simplify(header));
    if (field) {
      headerField.set(header, field);
      found.add(field);
    } else if (header.trim()) {
      unknownHeaders.push(header);
    }
  }
  if (!found.has("name")) throw new HttpError(400, "The file needs an Item column in its first row");

  const rows: StockImportRow[] = [];
  const planned: Planned[] = [];
  const seen = new Map<string, number>();
  let blank = 0;

  input.rows.forEach((raw, index) => {
    const rowNumber = index + 2; // the header is row 1
    const cells: Record<string, unknown> = {};
    for (const [header, value] of Object.entries(raw)) {
      const field = headerField.get(header);
      if (field) cells[field] = value;
    }
    if (Object.values(cells).every(isBlank)) {
      blank++;
      return;
    }

    const name = String(cells.name ?? "").trim().slice(0, 80);
    const out: StockImportRow = { row: rowNumber, name, unit: null, action: "error", quantity: 0, before: 0, after: 0, cost: null, notes: [] };
    rows.push(out);
    const errors: string[] = [];
    if (!name) errors.push("Item name is empty");

    const key = name.toLowerCase();
    const first = seen.get(key);
    if (name && first !== undefined) {
      out.error = `Same item as row ${first}: skipped, so the stock is not added twice`;
      return;
    }
    if (name) seen.set(key, rowNumber);

    const existing = name ? (byName.get(key) ?? null) : null;
    let unit: StockUnit | null = null;
    if (!isBlank(cells.unit)) {
      unit = parseStockUnit(cells.unit);
      if (!unit) errors.push(`"${String(cells.unit).trim()}" is not a counted-in type. Use g, kg, ml, L, pcs, dozen, packet, box, bottle, can, tray or bunch`);
    }
    if (existing) {
      if (unit && unit !== existing.unit) errors.push(`${existing.name} is counted in ${existing.unit}, not ${unit}. Leave Counted in empty or use ${existing.unit}`);
      unit = existing.unit;
    } else if (!unit && errors.length === 0) {
      errors.push("A new item needs Counted in");
    }
    out.unit = unit;

    const number = (field: string, label: string, min: number, integer = false): number | null => {
      if (isBlank(cells[field])) return null;
      const n = asNumber(cells[field]);
      if (n === null || n < min) {
        errors.push(`${label} must be a number${min > 0 ? ` of at least ${min}` : ", zero or more"}`);
        return null;
      }
      return integer ? Math.round(n) : n;
    };
    const quantityRaw = number("quantity", "Quantity", 0);
    if (!isBlank(cells.quantity) && quantityRaw === null && asNumber(cells.quantity) !== null) {
      errors.push("Quantity can't be negative. To take stock out, use Wastage or Adjust on the item.");
    }
    const cost = number("cost", "Cost per unit", 0);
    const reorder = number("reorder", "Alert below", 0);
    const purchaseFactor = number("purchaseFactor", "Units per purchase unit", 1);
    const purchaseUnit = isBlank(cells.purchaseUnit) ? null : String(cells.purchaseUnit).trim().slice(0, 12);

    if (errors.length > 0) {
      out.error = errors.join(". ");
      return;
    }

    const quantity = round3(quantityRaw ?? 0);
    const before = existing ? (onHand.get(existing._id.toString()) ?? 0) : 0;
    out.quantity = quantity;
    out.before = round3(before);
    out.after = round3(before + quantity);
    out.cost = cost;

    if (!existing) {
      out.action = "create";
      out.notes.push(quantity > 0 ? "New item" : "New item, no stock yet");
    } else {
      const detailChanges: string[] = [];
      if (reorder !== null && reorder !== existing.reorderLevel) detailChanges.push(`alert below ${existing.reorderLevel} → ${reorder}`);
      if (purchaseUnit !== null && purchaseUnit !== existing.purchaseUnit) detailChanges.push(`bought in ${existing.purchaseUnit || "none"} → ${purchaseUnit}`);
      if (purchaseFactor !== null && purchaseFactor !== existing.purchaseFactor) detailChanges.push(`units per purchase unit ${existing.purchaseFactor} → ${purchaseFactor}`);
      out.notes.push(...detailChanges);
      out.action = quantity > 0 ? "add" : detailChanges.length > 0 ? "update" : "unchanged";
    }
    if (quantity > 0 && cost !== null) out.notes.push(`cost ₹${cost} per ${unit}`);
    planned.push({ existing, name: existing?.name ?? name, unit: unit!, quantity, cost, reorder, purchaseUnit, purchaseFactor });
  });

  const count = (action: Action) => rows.filter((r) => r.action === action).length;
  return {
    repo,
    rows,
    planned,
    unknownHeaders,
    counts: {
      rows: rows.length,
      create: count("create"),
      add: count("add"),
      update: count("update"),
      unchanged: count("unchanged"),
      error: count("error"),
      blank,
    },
  };
}

export async function previewStockImport(ctx: RequestContext, input: StockImportInput) {
  const plan = await buildPlan(ctx, input);
  return { counts: plan.counts, rows: plan.rows, unknownHeaders: plan.unknownHeaders };
}

export async function applyStockImport(ctx: RequestContext, input: StockImportInput) {
  const plan = await buildPlan(ctx, input);
  const { repo } = plan;
  let createdItems = 0;
  let addedQuantityRows = 0;

  await withTransaction(async (session) => {
    const onHand = await repo.onHand(undefined, session);
    const movements: NewMovement[] = [];
    for (const row of plan.planned) {
      let itemId: Types.ObjectId;
      let avgCost: number;
      let base: number;
      if (row.existing) {
        const item = row.existing;
        itemId = item._id;
        avgCost = item.avgCost;
        base = Math.max(onHand.get(item._id.toString()) ?? 0, 0);
        const set: Partial<IStockItem> = {};
        if (row.reorder !== null) set.reorderLevel = row.reorder;
        if (row.purchaseUnit !== null) set.purchaseUnit = row.purchaseUnit;
        if (row.purchaseFactor !== null) set.purchaseFactor = row.purchaseFactor;
        if (Object.keys(set).length > 0) await repo.updateStockItemFields(itemId, set, session);
      } else {
        const defaults = DEFAULT_PURCHASE[row.unit];
        const created = await repo.createStockItemIn(
          {
            name: row.name,
            unit: row.unit,
            purchaseUnit: row.purchaseUnit ?? defaults?.purchaseUnit ?? "",
            purchaseFactor: row.purchaseFactor ?? (row.purchaseUnit !== null ? 1 : (defaults?.purchaseFactor ?? 1)),
            reorderLevel: row.reorder ?? 0,
            avgCost: 0,
            isActive: true,
          },
          session
        );
        itemId = created._id;
        avgCost = 0;
        base = 0;
        createdItems++;
      }
      if (row.quantity > 0) {
        const unitCost = row.cost ?? avgCost;
        if (row.cost !== null) {
          avgCost = round6((base * avgCost + row.quantity * row.cost) / (base + row.quantity));
          await repo.setAvgCost(itemId, avgCost, session);
        }
        movements.push({
          stockItemId: itemId,
          type: "opening",
          quantity: row.quantity,
          unitCost,
          note: "Imported from Excel",
          byName: ctx.admin?.username,
        });
        addedQuantityRows++;
      }
    }
    await repo.insertMovements(movements, session);
  });

  await refreshSoldOut(ctx.restaurantId);
  const { counts } = plan;
  await writeAudit(
    ctx,
    "inventory.import",
    `Imported stock from Excel: ${counts.create} new items, stock added to ${counts.add}, ${counts.update} updated, ${counts.error} rows skipped`
  );
  return {
    message: "Import complete",
    created: counts.create,
    added: counts.add,
    updated: counts.update,
    unchanged: counts.unchanged,
    skipped: counts.error,
    errors: plan.rows.filter((r) => r.action === "error").slice(0, 50),
    createdItems,
    stockLines: addedQuantityRows,
  };
}
