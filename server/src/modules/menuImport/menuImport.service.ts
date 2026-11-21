import { Types } from "mongoose";

import { RequestContext } from "../../core/context";
import { withTransaction } from "../../core/transaction";
import { writeAudit } from "../../utils/audit";
import { HttpError } from "../../utils/httpError";
import { clearRecommendationCache } from "../recommendations/recommendations.service";
import { fieldForHeader, IMPORT_FIELDS } from "./menuImport.fields";
import { MenuImportRepository } from "./menuImport.repository";
import { ImportInput } from "./menuImport.schema";

type Action = "insert" | "update" | "unchanged" | "duplicate" | "error";
type Value = string | number | boolean;

interface PlannedRow {
  row: number;
  name: string;
  category: string;
  subcategory: string;
  action: Action;
  changes: string[];
  note?: string;
}

interface PlannedInsert {
  catLower: string;
  subLower: string;
  doc: Record<string, unknown>;
}

interface PlannedUpdate {
  id: Types.ObjectId;
  set: Record<string, unknown>;
  /** When the dish moves to a subcategory, the subcategory is looked up by name once any new ones exist. */
  move?: { catLower: string; subLower: string };
}

const lower = (text: string) => text.trim().toLowerCase();
const SHORT_CODE = /^[A-Z0-9]{1,6}$/;
const PREVIEW_ROWS = 1000;
const PREVIEW_REMOVALS = 200;

const isBlank = (raw: unknown) => raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "");

function asNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const n = Number(raw.replace(/[₹,\s]/g, "").replace(/^rs\.?/i, ""));
  return Number.isFinite(n) ? n : null;
}

function asBool(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw === 1 ? true : raw === 0 ? false : null;
  if (typeof raw !== "string") return null;
  const t = raw.trim().toLowerCase();
  if (["yes", "y", "true", "1", "on", "active", "available"].includes(t)) return true;
  if (["no", "n", "false", "0", "off", "inactive", "unavailable", "hidden"].includes(t)) return false;
  return null;
}

function asFoodType(raw: unknown): "veg" | "non-veg" | "egg" | null {
  if (typeof raw !== "string") return null;
  const t = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (t === "veg" || t === "vegetarian") return "veg";
  if (t === "nonveg" || t === "nonvegetarian" || t === "non") return "non-veg";
  if (t === "egg" || t === "eggetarian") return "egg";
  return null;
}

/** Turns one cell into the value stored on the dish, or says why it can't be. A blank cell means "leave it alone". */
function parseCell(field: string, raw: unknown): { value: Value } | { error: string } | null {
  if (isBlank(raw)) return null;
  const label = IMPORT_FIELDS.find((f) => f.key === field)?.label ?? field;
  switch (field) {
    case "category":
    case "subcategory":
    case "name":
    case "station":
      return { value: String(raw).trim().slice(0, 120) };
    case "description":
      return { value: String(raw).trim().slice(0, 2000) };
    case "imageUrl": {
      const url = String(raw).trim();
      if (!url.startsWith("/uploads/") && !/^https:\/\//i.test(url)) return { error: `${label} must start with https://` };
      return { value: url };
    }
    case "price":
    case "packagingCharge":
    case "takeawayPrice":
    case "deliveryPrice": {
      const n = asNumber(raw);
      if (n === null || n < 0) return { error: `${label} must be a number, zero or more` };
      return { value: Math.round(n * 100) / 100 };
    }
    case "prepTimeMinutes": {
      const n = asNumber(raw);
      if (n === null || n < 0 || n > 600) return { error: `${label} must be between 0 and 600` };
      return { value: Math.round(n) };
    }
    case "foodType": {
      const type = asFoodType(raw);
      return type ? { value: type } : { error: `${label} must be Veg, Non-veg or Egg` };
    }
    case "isActive":
    case "isBestseller":
    case "isTodaySpecial":
    case "jainAvailable":
    case "spiceAdjustable": {
      const b = asBool(raw);
      return b === null ? { error: `${label} must be Yes or No` } : { value: b };
    }
    case "shortCode": {
      const code = String(raw).trim().toUpperCase();
      return SHORT_CODE.test(code) ? { value: code } : { error: `${label} must be 1 to 6 letters or digits` };
    }
    default:
      return null;
  }
}

const money = (n: number) => `₹${n}`;
const yesNo = (b: boolean) => (b ? "Yes" : "No");

interface ExistingFood {
  _id: Types.ObjectId;
  name: string;
  categoryId: Types.ObjectId;
  subcategoryId: Types.ObjectId;
  price: number;
  description?: string;
  imageUrl?: string;
  isActive: boolean;
  isBestseller: boolean;
  isTodaySpecial: boolean;
  jainAvailable?: boolean;
  spiceAdjustable?: boolean;
  foodType: string;
  prepTimeMinutes: number;
  stationId?: Types.ObjectId | null;
  shortCode?: string;
  packagingCharge: number;
  priceRules?: { takeaway?: number | null; delivery?: number | null };
}

async function buildPlan(ctx: RequestContext, input: ImportInput) {
  const repo = new MenuImportRepository(ctx.restaurantId);
  const [categories, subcategories, stations, foodsRaw] = await Promise.all([
    repo.categories(),
    repo.subcategories(),
    repo.stations(),
    repo.foodItems(),
  ]);
  const foods = foodsRaw as unknown as ExistingFood[];

  // Which spreadsheet header is which dish detail.
  const headerField = new Map<string, string>();
  const found = new Set<string>();
  const unknownHeaders: string[] = [];
  for (const header of new Set(input.rows.flatMap((row) => Object.keys(row)))) {
    const key = fieldForHeader(header);
    if (key) {
      headerField.set(header, key);
      found.add(key);
    } else if (header.trim()) {
      unknownHeaders.push(header);
    }
  }
  if (!found.has("category") || !found.has("name")) {
    throw new HttpError(400, "The file needs a Category column and a Name column in its first row");
  }
  const chosen = new Set<string>(IMPORT_FIELDS.filter((f) => f.locked).map((f) => f.key));
  for (const key of input.fields ?? [...found]) if (found.has(key)) chosen.add(key);

  const catByName = new Map(categories.map((c) => [lower(c.name), c]));
  const subByKey = new Map(subcategories.map((s) => [`${s.categoryId}|${lower(s.name)}`, s]));
  const stationByName = new Map(stations.map((s) => [lower(s.name), s]));
  const foodByKey = new Map(foods.map((f) => [`${f.categoryId}|${lower(f.name)}`, f]));
  const codeOwner = new Map(foods.filter((f) => f.shortCode).map((f) => [f.shortCode as string, f]));

  const newCategories = new Map<string, string>(); // lower name -> name as written
  const newSubcategories = new Map<string, { catLower: string; name: string }>();
  const inserts: PlannedInsert[] = [];
  const updates: PlannedUpdate[] = [];
  const rows: PlannedRow[] = [];
  const matched = new Set<string>();
  const seenInFile = new Map<string, number>();
  const claimedCodes = new Map<string, number>();
  let ignored = 0;

  input.rows.forEach((raw, index) => {
    const rowNumber = index + 2; // the header is row 1
    const values: Record<string, Value> = {};
    const errors: string[] = [];
    let anything = false;
    for (const [header, cell] of Object.entries(raw)) {
      const field = headerField.get(header);
      if (!field) continue;
      if (!isBlank(cell)) anything = true;
      if (!chosen.has(field)) continue;
      const parsed = parseCell(field, cell);
      if (!parsed) continue;
      if ("error" in parsed) errors.push(parsed.error);
      else values[field] = parsed.value;
    }
    if (!anything) {
      ignored++;
      return;
    }

    const category = String(values.category ?? "");
    const name = String(values.name ?? "");
    const subcategory = String(values.subcategory ?? "");
    const planned: PlannedRow = { row: rowNumber, name, category, subcategory, action: "error", changes: [] };
    rows.push(planned);
    if (!category) errors.push("Category is empty");
    if (!name) errors.push("Name is empty");
    if (!category || !name) {
      planned.note = errors.join(". ");
      return;
    }

    const catLower = lower(category);
    const subLower = lower(subcategory);
    const fileKey = `${catLower}|${lower(name)}`;
    const firstSeen = seenInFile.get(fileKey);
    if (firstSeen !== undefined) {
      planned.action = "duplicate";
      planned.note = `Same dish as row ${firstSeen}: skipped`;
      return;
    }
    seenInFile.set(fileKey, rowNumber);

    const category_ = catByName.get(catLower);
    if (!category_) {
      if (input.createMissing) newCategories.set(catLower, category);
      else errors.push(`Category "${category}" is not on the menu`);
    }
    let subKnown = false;
    if (subcategory) {
      const existingSub = category_ ? subByKey.get(`${category_._id}|${subLower}`) : undefined;
      subKnown = !!existingSub;
      if (!existingSub) {
        if (input.createMissing) newSubcategories.set(`${catLower}|${subLower}`, { catLower, name: subcategory });
        else errors.push(`Subcategory "${subcategory}" is not under ${category}`);
      }
    }

    let stationId: Types.ObjectId | null | undefined;
    if (values.station !== undefined) {
      const station = stationByName.get(lower(String(values.station)));
      if (station) stationId = station._id;
      else errors.push(`Station "${values.station}" does not exist`);
    }

    const existing = category_ ? foodByKey.get(`${category_._id}|${lower(name)}`) : undefined;
    if (existing) matched.add(String(existing._id));

    if (typeof values.shortCode === "string") {
      const code = values.shortCode;
      const owner = codeOwner.get(code);
      if (owner && (!existing || String(owner._id) !== String(existing._id))) {
        errors.push(`Short code ${code} is already used by ${owner.name}`);
      }
      const other = claimedCodes.get(code);
      if (other !== undefined) errors.push(`Short code ${code} is also on row ${other}`);
    }

    if (errors.length > 0) {
      planned.note = errors.join(". ");
      return;
    }
    if (typeof values.shortCode === "string") claimedCodes.set(values.shortCode, rowNumber);

    if (existing) {
      if (input.mode === "insert") {
        planned.action = "duplicate";
        planned.note = "Already on the menu: left as it is";
        return;
      }
      const set: Record<string, unknown> = {};
      const changes: string[] = [];
      const change = (key: string, label: string, was: string, now: string, apply: () => void) => {
        planned.changes.push(`${label}: ${was} → ${now}`);
        changes.push(key);
        apply();
      };
      const compareNumber = (field: string, label: string, current: number | null | undefined, path: string) => {
        const next = values[field];
        if (typeof next !== "number" || next === (current ?? null)) return;
        change(field, label, current == null ? "none" : money(current), money(next), () => (set[path] = next));
      };
      compareNumber("price", "Price", existing.price, "price");
      compareNumber("packagingCharge", "Packaging", existing.packagingCharge, "packagingCharge");
      compareNumber("takeawayPrice", "Takeaway price", existing.priceRules?.takeaway, "priceRules.takeaway");
      compareNumber("deliveryPrice", "Delivery price", existing.priceRules?.delivery, "priceRules.delivery");
      compareNumber("prepTimeMinutes", "Prep time", existing.prepTimeMinutes, "prepTimeMinutes");
      const compareText = (field: string, label: string, current: string | undefined, path: string) => {
        const next = values[field];
        if (typeof next !== "string" || next === (current ?? "")) return;
        change(field, label, current ? `"${current}"` : "empty", `"${next}"`, () => (set[path] = next));
      };
      compareText("description", "Description", existing.description, "description");
      compareText("imageUrl", "Image", existing.imageUrl, "imageUrl");
      compareText("shortCode", "Short code", existing.shortCode, "shortCode");
      if (typeof values.foodType === "string" && values.foodType !== existing.foodType) {
        change("foodType", "Food type", existing.foodType, values.foodType, () => (set.foodType = values.foodType));
      }
      const compareBool = (field: string, label: string, current: boolean) => {
        const next = values[field];
        if (typeof next !== "boolean" || next === current) return;
        change(field, label, yesNo(current), yesNo(next), () => (set[field] = next));
      };
      compareBool("isActive", "Active", existing.isActive);
      compareBool("isBestseller", "Bestseller", existing.isBestseller);
      compareBool("isTodaySpecial", "Today's special", existing.isTodaySpecial);
      compareBool("jainAvailable", "Jain available", existing.jainAvailable !== false);
      compareBool("spiceAdjustable", "Spice adjustable", existing.spiceAdjustable !== false);
      if (stationId !== undefined && String(stationId) !== String(existing.stationId ?? "")) {
        const was = stations.find((s) => String(s._id) === String(existing.stationId ?? ""))?.name ?? "none";
        change("station", "Station", was, String(values.station), () => (set.stationId = stationId));
      }
      let move: PlannedUpdate["move"];
      if (subcategory) {
        const current = subcategories.find((s) => String(s._id) === String(existing.subcategoryId));
        if (!subKnown || String(current?._id) !== String(subByKey.get(`${category_!._id}|${subLower}`)?._id)) {
          planned.changes.push(`Subcategory: ${current?.name ?? "none"} → ${subcategory}`);
          move = { catLower, subLower };
        }
      }
      if (changes.length === 0 && !move) {
        planned.action = "unchanged";
        return;
      }
      planned.action = "update";
      updates.push({ id: existing._id, set, move });
      return;
    }

    // A new dish needs a subcategory and a price; everything else falls back to the usual defaults.
    if (!subcategory) {
      planned.note = "Subcategory is needed to add a new dish";
      return;
    }
    if (typeof values.price !== "number") {
      planned.note = "Price is needed to add a new dish";
      return;
    }
    planned.action = "insert";
    inserts.push({
      catLower,
      subLower,
      doc: {
        name,
        price: values.price,
        description: values.description ?? "",
        imageUrl: values.imageUrl ?? "",
        isActive: values.isActive ?? true,
        isBestseller: values.isBestseller ?? false,
        isTodaySpecial: values.isTodaySpecial ?? false,
        jainAvailable: values.jainAvailable ?? true,
        spiceAdjustable: values.spiceAdjustable ?? true,
        foodType: values.foodType ?? "veg",
        ...(values.prepTimeMinutes !== undefined && { prepTimeMinutes: values.prepTimeMinutes }),
        ...(stationId && { stationId }),
        ...(values.shortCode !== undefined && { shortCode: values.shortCode }),
        packagingCharge: values.packagingCharge ?? 0,
        priceRules: {
          takeaway: typeof values.takeawayPrice === "number" ? values.takeawayPrice : null,
          delivery: typeof values.deliveryPrice === "number" ? values.deliveryPrice : null,
          areas: [],
        },
      },
    });
  });

  const toRemove = input.mode === "replace" ? foods.filter((f) => f.isActive && !matched.has(String(f._id))) : [];
  const count = (action: Action) => rows.filter((r) => r.action === action).length;
  const counts = {
    rows: rows.length,
    insert: count("insert"),
    update: count("update"),
    unchanged: count("unchanged"),
    duplicate: count("duplicate"),
    error: count("error"),
    remove: toRemove.length,
    blank: ignored,
    newCategories: newCategories.size,
    newSubcategories: newSubcategories.size,
  };
  const fields = IMPORT_FIELDS.filter((f) => found.has(f.key)).map((f) => ({
    key: f.key,
    label: f.label,
    locked: !!f.locked,
    selected: chosen.has(f.key),
  }));
  return {
    repo,
    categories,
    subcategories,
    foods,
    newCategories,
    newSubcategories,
    inserts,
    updates,
    rows,
    toRemove,
    counts,
    fields,
    unknownHeaders,
  };
}

export async function previewImport(ctx: RequestContext, input: ImportInput) {
  const plan = await buildPlan(ctx, input);
  return {
    counts: plan.counts,
    fields: plan.fields,
    unknownHeaders: plan.unknownHeaders,
    rows: plan.rows.slice(0, PREVIEW_ROWS),
    rowsShown: Math.min(plan.rows.length, PREVIEW_ROWS),
    toRemove: plan.toRemove.slice(0, PREVIEW_REMOVALS).map((f) => ({
      name: f.name,
      category: plan.categories.find((c) => String(c._id) === String(f.categoryId))?.name ?? "",
    })),
  };
}

export async function applyImport(ctx: RequestContext, input: ImportInput) {
  const plan = await buildPlan(ctx, input);
  const { repo } = plan;

  await withTransaction(async (session) => {
    const catId = new Map(plan.categories.map((c) => [lower(c.name), c._id]));
    const created = await repo.createCategories([...plan.newCategories.values()], session);
    for (const c of created) catId.set(lower(c.name), c._id);

    const subId = new Map(plan.subcategories.map((s) => [`${s.categoryId}|${lower(s.name)}`, s._id]));
    const newSubs = [...plan.newSubcategories.values()].map((s) => ({
      categoryId: catId.get(s.catLower) as Types.ObjectId,
      name: s.name,
    }));
    for (const s of await repo.createSubcategories(newSubs, session)) subId.set(`${s.categoryId}|${lower(s.name)}`, s._id);
    const subFor = (catLower: string, subLower: string) => subId.get(`${catId.get(catLower)}|${subLower}`);

    await repo.insertFoodItems(
      plan.inserts.map((i) => ({
        ...i.doc,
        categoryId: catId.get(i.catLower),
        subcategoryId: subFor(i.catLower, i.subLower),
      })),
      session
    );
    await repo.updateFoodItems(
      plan.updates.map((u) => ({
        id: u.id,
        set: u.move
          ? { ...u.set, subcategoryId: subFor(u.move.catLower, u.move.subLower) }
          : u.set,
      })),
      session
    );
    await repo.hideFoodItems(
      plan.toRemove.map((f) => f._id),
      session
    );
  });

  clearRecommendationCache(ctx.restaurantId);
  const { counts } = plan;
  await writeAudit(
    ctx,
    "menu.import",
    `Imported menu from Excel (${input.mode}): ${counts.insert} added, ${counts.update} updated, ${counts.remove} hidden, ${counts.error} rows skipped`
  );
  return {
    message: "Import complete",
    inserted: counts.insert,
    updated: counts.update,
    unchanged: counts.unchanged,
    duplicates: counts.duplicate,
    hidden: counts.remove,
    skipped: counts.error,
    createdCategories: counts.newCategories,
    createdSubcategories: counts.newSubcategories,
    errors: plan.rows.filter((r) => r.action === "error").slice(0, 50),
  };
}

export async function exportMenu(ctx: RequestContext) {
  const repo = new MenuImportRepository(ctx.restaurantId);
  const [categories, subcategories, stations, foods] = await Promise.all([
    repo.categories(),
    repo.subcategories(),
    repo.stations(),
    repo.foodItems(),
  ]);
  const catName = new Map(categories.map((c) => [String(c._id), c.name]));
  const subName = new Map(subcategories.map((s) => [String(s._id), s.name]));
  const stationName = new Map(stations.map((s) => [String(s._id), s.name]));
  const typeLabel: Record<string, string> = { veg: "Veg", "non-veg": "Non-veg", egg: "Egg" };
  const rows = (foods as unknown as ExistingFood[])
    .map((f) => ({
      category: catName.get(String(f.categoryId)) ?? "",
      subcategory: subName.get(String(f.subcategoryId)) ?? "",
      name: f.name,
      price: f.price,
      description: f.description ?? "",
      foodType: typeLabel[f.foodType] ?? f.foodType,
      isActive: yesNo(f.isActive),
      isBestseller: yesNo(f.isBestseller),
      isTodaySpecial: yesNo(f.isTodaySpecial),
      shortCode: f.shortCode ?? "",
      prepTimeMinutes: f.prepTimeMinutes,
      packagingCharge: f.packagingCharge,
      takeawayPrice: f.priceRules?.takeaway ?? null,
      deliveryPrice: f.priceRules?.delivery ?? null,
      jainAvailable: yesNo(f.jainAvailable !== false),
      spiceAdjustable: yesNo(f.spiceAdjustable !== false),
      station: f.stationId ? (stationName.get(String(f.stationId)) ?? "") : "",
      imageUrl: f.imageUrl ?? "",
    }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.subcategory.localeCompare(b.subcategory) || a.name.localeCompare(b.name));
  return { columns: IMPORT_FIELDS.map((f) => ({ key: f.key, label: f.label })), rows };
}
