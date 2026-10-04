import { Request, Response } from "express";
import { Types } from "mongoose";

import { asyncHandler } from "../middleware/errorHandler";
import Category from "../models/Category";
import FoodItem from "../models/FoodItem";
import Restaurant from "../models/Restaurant";
import { clearRecommendationCache } from "../modules/recommendations/recommendations.service";
import Station from "../models/Station";
import Subcategory from "../models/Subcategory";
import { HttpError } from "../utils/httpError";
import { verifyToken } from "../utils/jwt";
import { basePriceFor } from "../modules/pricing/pricing";
import TableModel from "../models/Table";

async function resolveStationId(value: unknown, restaurantId: string): Promise<Types.ObjectId | null | undefined> {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !Types.ObjectId.isValid(value)) throw new HttpError(400, "Invalid station");
  const station = await Station.findOne({ _id: value, restaurantId }).select("_id");
  if (!station) throw new HttpError(404, "Station not found");
  return station._id;
}

const SHORT_CODE_PATTERN = /^[A-Z0-9]{1,6}$/;

function normalizeShortCode(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const code = String(value).trim().toUpperCase();
  if (!code) return null;
  if (!SHORT_CODE_PATTERN.test(code)) throw new HttpError(400, "Short code must be 1 to 6 letters or digits");
  return code;
}

async function assertShortCodeFree(restaurantId: string, code: string | null | undefined, exceptId?: string) {
  if (!code) return;
  const taken = await FoodItem.findOne({
    restaurantId,
    shortCode: code,
    ...(exceptId && { _id: { $ne: exceptId } }),
  }).select("name");
  if (taken) throw new HttpError(409, `Short code ${code} is already used by ${taken.name}`);
}

function validId(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(400, "Invalid id");
}


function optionalPrice(value: unknown, label: string): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `${label} must be zero or more`);
  return Math.round(n * 100) / 100;
}

async function resolvePriceRules(value: unknown, restaurantId: string) {
  if (value === undefined) return undefined;
  if (value === null) return { takeaway: null, delivery: null, areas: [] };
  if (typeof value !== "object") throw new HttpError(400, "Invalid prices");
  const raw = value as { takeaway?: unknown; delivery?: unknown; areas?: unknown };
  const areas = Array.isArray(raw.areas) ? raw.areas : [];
  const restaurant = await Restaurant.findById(restaurantId).select("areas").lean();
  const known = new Set((restaurant?.areas ?? []).map((a) => a._id.toString()));
  const seen = new Set<string>();
  const areaPrices = [];
  for (const entry of areas) {
    const areaId = String((entry as { areaId?: unknown })?.areaId ?? "");
    const price = optionalPrice((entry as { price?: unknown })?.price, "An area price");
    if (price == null) continue;
    if (!known.has(areaId)) throw new HttpError(400, "One of the area prices is for an area that no longer exists");
    if (seen.has(areaId)) continue;
    seen.add(areaId);
    areaPrices.push({ areaId: new Types.ObjectId(areaId), price });
  }
  return {
    takeaway: optionalPrice(raw.takeaway, "The takeaway price"),
    delivery: optionalPrice(raw.delivery, "The delivery price"),
    areas: areaPrices,
  };
}

function resolvePackaging(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  return optionalPrice(value, "The packaging charge") ?? 0;
}

const MAX_COMBO_PARTS = 10;

async function resolveComboItems(value: unknown, restaurantId: string, selfId?: string) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new HttpError(400, "Combo items must be a list");
  const parts = value
    .map((entry) => ({
      foodItemId: String((entry as { foodItemId?: unknown })?.foodItemId ?? ""),
      quantity: Math.round(Number((entry as { quantity?: unknown })?.quantity ?? 1)),
    }))
    .filter((p) => p.foodItemId);
  if (parts.length > MAX_COMBO_PARTS) throw new HttpError(400, `A combo can have at most ${MAX_COMBO_PARTS} dishes`);
  if (parts.some((p) => !Types.ObjectId.isValid(p.foodItemId))) throw new HttpError(400, "One of the combo dishes is invalid");
  if (parts.some((p) => p.foodItemId === selfId)) throw new HttpError(400, "A combo can't include itself");
  if (parts.some((p) => !Number.isFinite(p.quantity) || p.quantity < 1 || p.quantity > 20)) {
    throw new HttpError(400, "Each combo dish needs a quantity between 1 and 20");
  }
  const ids = [...new Set(parts.map((p) => p.foodItemId))];
  if (ids.length !== parts.length) throw new HttpError(400, "Each dish can appear in a combo only once");
  const found = await FoodItem.find({ _id: { $in: ids }, restaurantId }).select("comboItems").lean();
  if (found.length !== ids.length) throw new HttpError(404, "One of the combo dishes no longer exists");
  if (found.some((food) => (food.comboItems ?? []).length > 0)) throw new HttpError(400, "A combo can't contain another combo");
  return parts.map((p) => ({ foodItemId: new Types.ObjectId(p.foodItemId), quantity: p.quantity }));
}

const MAX_PAIRINGS = 4;

async function resolvePairings(value: unknown, restaurantId: string, selfId?: string): Promise<Types.ObjectId[] | undefined> {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new HttpError(400, "Pairings must be a list of dishes");
  const ids = [...new Set(value.map(String))].filter((id) => id !== selfId);
  if (ids.length > MAX_PAIRINGS) throw new HttpError(400, `Pick at most ${MAX_PAIRINGS} dishes that go well with this one`);
  if (ids.some((id) => !Types.ObjectId.isValid(id))) throw new HttpError(400, "One of the paired dishes is invalid");
  const found = await FoodItem.countDocuments({ _id: { $in: ids }, restaurantId });
  if (found !== ids.length) throw new HttpError(404, "One of the paired dishes no longer exists");
  return ids.map((id) => new Types.ObjectId(id));
}

// ---------- Categories ----------

export const listCategories = asyncHandler(async (req: Request, res: Response) => {
  const categories = await Category.find({ restaurantId: req.restaurantId }).sort({ name: 1 });
  res.json(categories);
});

export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const { name, description, translations, defaultStationId } = req.body as {
    name?: string;
    description?: string;
    translations?: unknown;
    defaultStationId?: unknown;
  };
  if (!name) throw new HttpError(400, "name is required");
  const station = await resolveStationId(defaultStationId, req.restaurantId!);
  const category = await Category.create({
    restaurantId: req.restaurantId,
    name,
    description,
    translations: sanitizeTranslations(translations),
    isActive: true,
    ...(station !== undefined && { defaultStationId: station }),
  });
  res.status(201).json(category);
});

export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.id);
  const { name, description, translations, defaultStationId } = req.body as {
    name?: string;
    description?: string;
    translations?: unknown;
    defaultStationId?: unknown;
  };
  const station = await resolveStationId(defaultStationId, req.restaurantId!);
  const category = await Category.findOneAndUpdate(
    { _id: req.params.id, restaurantId: req.restaurantId },
    {
      $set: {
        ...(station !== undefined && { defaultStationId: station }),
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(translations !== undefined && { translations: sanitizeTranslations(translations) }),
      },
    },
    { new: true }
  );
  if (!category) throw new HttpError(404, "Category not found");
  res.json(category);
});

export const setCategoryActive = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.id);
  const { isActive } = req.body as { isActive: boolean };
  const category = await Category.findOneAndUpdate(
    { _id: req.params.id, restaurantId: req.restaurantId },
    { $set: { isActive: !!isActive } },
    { new: true }
  );
  if (!category) throw new HttpError(404, "Category not found");
  res.json(category);
});

// ---------- Subcategories ----------

export const listSubcategories = asyncHandler(async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = { restaurantId: req.restaurantId };
  if (req.query.categoryId) {
    validId(req.query.categoryId as string);
    filter.categoryId = req.query.categoryId;
  }
  const subcategories = await Subcategory.find(filter).sort({ name: 1 });
  res.json(subcategories);
});

export const createSubcategory = asyncHandler(async (req: Request, res: Response) => {
  const { categoryId, name, description, translations } = req.body as {
    categoryId?: string;
    name?: string;
    description?: string;
    translations?: unknown;
  };
  if (!categoryId || !name) throw new HttpError(400, "categoryId and name are required");
  validId(categoryId);
  const category = await Category.findOne({ _id: categoryId, restaurantId: req.restaurantId });
  if (!category) throw new HttpError(404, "Category not found");

  const subcategory = await Subcategory.create({
    restaurantId: req.restaurantId,
    categoryId,
    name,
    description,
    translations: sanitizeTranslations(translations),
    isActive: true,
  });
  res.status(201).json(subcategory);
});

export const updateSubcategory = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.id);
  const { categoryId, name, description, translations } = req.body as {
    categoryId?: string;
    name?: string;
    description?: string;
    translations?: unknown;
  };
  if (categoryId) {
    validId(categoryId);
    const category = await Category.findOne({ _id: categoryId, restaurantId: req.restaurantId });
    if (!category) throw new HttpError(404, "Category not found");
  }
  const subcategory = await Subcategory.findOneAndUpdate(
    { _id: req.params.id, restaurantId: req.restaurantId },
    {
      $set: {
        ...(categoryId !== undefined && { categoryId }),
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(translations !== undefined && { translations: sanitizeTranslations(translations) }),
      },
    },
    { new: true }
  );
  if (!subcategory) throw new HttpError(404, "Subcategory not found");
  res.json(subcategory);
});

export const setSubcategoryActive = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.id);
  const { isActive } = req.body as { isActive: boolean };
  const subcategory = await Subcategory.findOneAndUpdate(
    { _id: req.params.id, restaurantId: req.restaurantId },
    { $set: { isActive: !!isActive } },
    { new: true }
  );
  if (!subcategory) throw new HttpError(404, "Subcategory not found");
  res.json(subcategory);
});

// ---------- Food items ----------

export const listFoodItems = asyncHandler(async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = { restaurantId: req.restaurantId };
  if (req.query.categoryId) {
    validId(req.query.categoryId as string);
    filter.categoryId = req.query.categoryId;
  }
  if (req.query.subcategoryId) {
    validId(req.query.subcategoryId as string);
    filter.subcategoryId = req.query.subcategoryId;
  }
  const foodItems = await FoodItem.find(filter).sort({ name: 1 });
  res.json(foodItems);
});

const FOOD_TYPES = ["veg", "non-veg", "egg"];

function normalizeFoodType(value: unknown): string {
  if (typeof value !== "string" || !FOOD_TYPES.includes(value)) return "veg";
  return value;
}

function normalizeRating(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(5, Math.max(0, Math.round(n * 10) / 10));
}

function normalizePrepTime(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

function sanitizeModifierGroups(
  value: unknown
): { name: string; type: "single" | "multi"; required: boolean; options: { label: string; priceDelta: number }[] }[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((g) => g && typeof g === "object" && typeof (g as any).name === "string" && (g as any).name.trim())
    .map((g) => {
      const grp = g as any;
      return {
        name: String(grp.name).trim(),
        type: grp.type === "multi" ? "multi" : "single",
        required: !!grp.required,
        options: Array.isArray(grp.options)
          ? grp.options
              .filter((o: any) => o && typeof o.label === "string" && o.label.trim())
              .map((o: any) => ({ label: String(o.label).trim(), priceDelta: Number(o.priceDelta) || 0 }))
          : [],
      };
    });
}

function sanitizeTranslations(value: unknown): Record<string, { name?: string; description?: string }> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, { name?: string; description?: string }> = {};
  for (const [lang, v] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[a-z]{2}$/.test(lang) || !v || typeof v !== "object") continue;
    const entry: { name?: string; description?: string } = {};
    const rec = v as Record<string, unknown>;
    if (typeof rec.name === "string" && rec.name.trim()) entry.name = rec.name.trim();
    if (typeof rec.description === "string" && rec.description.trim()) entry.description = rec.description.trim();
    if (entry.name || entry.description) out[lang] = entry;
  }
  return out;
}

export const createFoodItem = asyncHandler(async (req: Request, res: Response) => {
  const {
    categoryId,
    subcategoryId,
    name,
    price,
    description,
    imageUrl,
    isBestseller,
    bestsellerEmoji,
    isTodaySpecial,
    foodType,
    rating,
    prepTimeMinutes,
    modifierGroups,
    translations,
    stationId,
    shortCode,
    pairsWith,
    priceRules,
    packagingCharge,
    comboItems,
  } = req.body as {
    categoryId?: string;
    subcategoryId?: string;
    name?: string;
    price?: number;
    description?: string;
    imageUrl?: string;
    isBestseller?: boolean;
    bestsellerEmoji?: string;
    isTodaySpecial?: boolean;
    foodType?: string;
    rating?: number;
    prepTimeMinutes?: number;
    modifierGroups?: unknown;
    translations?: unknown;
    stationId?: unknown;
    shortCode?: unknown;
    pairsWith?: unknown;
    priceRules?: unknown;
    packagingCharge?: unknown;
    comboItems?: unknown;
  };
  const station = await resolveStationId(stationId, req.restaurantId!);
  const code = normalizeShortCode(shortCode);
  await assertShortCodeFree(req.restaurantId!, code);
  const pairings = await resolvePairings(pairsWith, req.restaurantId!);
  const rules = await resolvePriceRules(priceRules, req.restaurantId!);
  const packaging = resolvePackaging(packagingCharge);
  const combo = await resolveComboItems(comboItems, req.restaurantId!, undefined);
  if (!categoryId || !subcategoryId || !name || price === undefined) {
    throw new HttpError(400, "categoryId, subcategoryId, name and price are required");
  }
  validId(categoryId);
  validId(subcategoryId);
  if (typeof price !== "number" || price < 0) throw new HttpError(400, "price must be a non-negative number");

  const subcategory = await Subcategory.findOne({
    _id: subcategoryId,
    categoryId,
    restaurantId: req.restaurantId,
  });
  if (!subcategory) throw new HttpError(404, "Subcategory not found under the given category");

  const foodItem = await FoodItem.create({
    restaurantId: req.restaurantId,
    categoryId,
    subcategoryId,
    name,
    price,
    description,
    imageUrl,
    isActive: true,
    isBestseller: !!isBestseller,
    ...(bestsellerEmoji !== undefined && { bestsellerEmoji }),
    isTodaySpecial: !!isTodaySpecial,
    foodType: normalizeFoodType(foodType),
    rating: normalizeRating(rating),
    ...(prepTimeMinutes !== undefined && { prepTimeMinutes: normalizePrepTime(prepTimeMinutes) }),
    ...(modifierGroups !== undefined && { modifierGroups: sanitizeModifierGroups(modifierGroups) }),
    ...(translations !== undefined && { translations: sanitizeTranslations(translations) }),
    ...(station !== undefined && { stationId: station }),
    ...(code && { shortCode: code }),
    ...(pairings !== undefined && { pairsWith: pairings }),
    ...(rules !== undefined && { priceRules: rules }),
    ...(packaging !== undefined && { packagingCharge: packaging }),
    ...(combo !== undefined && { comboItems: combo }),
  });
  clearRecommendationCache(req.restaurantId!);
  res.status(201).json(foodItem);
});

export const updateFoodItem = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.id);
  const {
    categoryId,
    subcategoryId,
    name,
    price,
    description,
    imageUrl,
    isBestseller,
    bestsellerEmoji,
    isTodaySpecial,
    foodType,
    rating,
    prepTimeMinutes,
    modifierGroups,
    translations,
    stationId,
    shortCode,
    pairsWith,
    priceRules,
    packagingCharge,
    comboItems,
  } = req.body as {
    categoryId?: string;
    subcategoryId?: string;
    name?: string;
    price?: number;
    description?: string;
    imageUrl?: string;
    isBestseller?: boolean;
    bestsellerEmoji?: string;
    isTodaySpecial?: boolean;
    foodType?: string;
    rating?: number;
    prepTimeMinutes?: number;
    modifierGroups?: unknown;
    translations?: unknown;
    stationId?: unknown;
    shortCode?: unknown;
    pairsWith?: unknown;
    priceRules?: unknown;
    packagingCharge?: unknown;
    comboItems?: unknown;
  };
  const station = await resolveStationId(stationId, req.restaurantId!);
  const code = normalizeShortCode(shortCode);
  await assertShortCodeFree(req.restaurantId!, code, req.params.id);
  const pairings = await resolvePairings(pairsWith, req.restaurantId!, req.params.id);
  const rules = await resolvePriceRules(priceRules, req.restaurantId!);
  const packaging = resolvePackaging(packagingCharge);
  const combo = await resolveComboItems(comboItems, req.restaurantId!, req.params.id);
  if (price !== undefined && (typeof price !== "number" || price < 0)) {
    throw new HttpError(400, "price must be a non-negative number");
  }
  if (categoryId) validId(categoryId);
  if (subcategoryId) validId(subcategoryId);

  const foodItem = await FoodItem.findOneAndUpdate(
    { _id: req.params.id, restaurantId: req.restaurantId },
    {
      $set: {
        ...(categoryId !== undefined && { categoryId }),
        ...(subcategoryId !== undefined && { subcategoryId }),
        ...(name !== undefined && { name }),
        ...(price !== undefined && { price }),
        ...(description !== undefined && { description }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(isBestseller !== undefined && { isBestseller: !!isBestseller }),
        ...(bestsellerEmoji !== undefined && { bestsellerEmoji }),
        ...(isTodaySpecial !== undefined && { isTodaySpecial: !!isTodaySpecial }),
        ...(foodType !== undefined && { foodType: normalizeFoodType(foodType) }),
        ...(rating !== undefined && { rating: normalizeRating(rating) }),
        ...(prepTimeMinutes !== undefined && { prepTimeMinutes: normalizePrepTime(prepTimeMinutes) }),
        ...(modifierGroups !== undefined && { modifierGroups: sanitizeModifierGroups(modifierGroups) }),
        ...(translations !== undefined && { translations: sanitizeTranslations(translations) }),
        ...(station !== undefined && { stationId: station }),
        ...(code && { shortCode: code }),
        ...(pairings !== undefined && { pairsWith: pairings }),
    ...(rules !== undefined && { priceRules: rules }),
    ...(packaging !== undefined && { packagingCharge: packaging }),
    ...(combo !== undefined && { comboItems: combo }),
      },
      ...(code === null && { $unset: { shortCode: 1 } }),
    },
    { new: true }
  );
  if (!foodItem) throw new HttpError(404, "Food item not found");
  clearRecommendationCache(req.restaurantId!);
  res.json(foodItem);
});

export const setFoodItemActive = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.id);
  const { isActive } = req.body as { isActive: boolean };
  const foodItem = await FoodItem.findOneAndUpdate(
    { _id: req.params.id, restaurantId: req.restaurantId },
    { $set: { isActive: !!isActive } },
    { new: true }
  );
  if (!foodItem) throw new HttpError(404, "Food item not found");
  clearRecommendationCache(req.restaurantId!);
  res.json(foodItem);
});

// ---------- Public menu (effective-active computed on read, not cascaded on write) ----------

async function guestAreaId(req: Request): Promise<string | null> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  try {
    const payload = verifyToken(header.slice("Bearer ".length));
    if (payload.role !== "table" || !payload.tableId || !Types.ObjectId.isValid(payload.tableId)) return null;
    const table = await TableModel.findOne({ _id: payload.tableId, restaurantId: req.restaurantId }).select("areaId").lean();
    return table?.areaId?.toString() ?? null;
  } catch {
    return null;
  }
}

export const getPublicMenu = asyncHandler(async (req: Request, res: Response) => {
  const areaId = await guestAreaId(req);
  const [categories, subcategories, foodItems] = await Promise.all([
    Category.find({ restaurantId: req.restaurantId, isActive: true }).sort({ name: 1 }),
    Subcategory.find({ restaurantId: req.restaurantId, isActive: true }).sort({ name: 1 }),
    FoodItem.find({ restaurantId: req.restaurantId, isActive: true }).sort({ name: 1 }),
  ]);

  const activeCategoryIds = new Set(categories.map((c) => c._id.toString()));
  const visibleSubcategories = subcategories.filter((s) => activeCategoryIds.has(s.categoryId.toString()));
  const activeSubcategoryIds = new Set(visibleSubcategories.map((s) => s._id.toString()));
  const visibleFoodItems = foodItems.filter(
    (f) => activeCategoryIds.has(f.categoryId.toString()) && activeSubcategoryIds.has(f.subcategoryId.toString())
  );
  const componentIds = visibleFoodItems.flatMap((f) => (f.comboItems ?? []).map((c) => c.foodItemId));
  const componentName = new Map(
    (componentIds.length
      ? await FoodItem.find({ _id: { $in: componentIds }, restaurantId: req.restaurantId }).select("name").lean()
      : []
    ).map((c) => [c._id.toString(), c.name])
  );

  const menu = categories.map((category) => ({
    _id: category._id,
    name: category.name,
    description: category.description,
    translations: category.translations || {},
    subcategories: visibleSubcategories
      .filter((s) => s.categoryId.toString() === category._id.toString())
      .map((subcategory) => ({
        _id: subcategory._id,
        name: subcategory.name,
        description: subcategory.description,
        translations: subcategory.translations || {},
        foodItems: visibleFoodItems
          .filter((f) => f.subcategoryId.toString() === subcategory._id.toString())
          .map((f) => ({
            _id: f._id,
            name: f.name,
            price: basePriceFor(f, { orderType: "dine-in", areaId }),
            description: f.description,
            imageUrl: f.imageUrl,
            components: (f.comboItems ?? [])
              .filter((c) => componentName.has(c.foodItemId.toString()))
              .map((c) => ({ name: componentName.get(c.foodItemId.toString())!, quantity: c.quantity })),
            isBestseller: f.isBestseller,
            bestsellerEmoji: f.bestsellerEmoji,
            isTodaySpecial: f.isTodaySpecial,
            foodType: f.foodType,
            rating: f.rating,
            translations: f.translations || {},
            modifierGroups: f.modifierGroups || [],
            guestRating: f.reviewCount > 0 ? Math.round((f.reviewSum / f.reviewCount) * 10) / 10 : null,
            reviewCount: f.reviewCount || 0,
          })),
      })),
  }));

  res.json(menu);
});
