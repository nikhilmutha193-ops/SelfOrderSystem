import { Request, Response } from "express";
import { Types } from "mongoose";
import Category from "../models/Category";
import Subcategory from "../models/Subcategory";
import FoodItem from "../models/FoodItem";
import { asyncHandler } from "../middleware/errorHandler";
import { HttpError } from "../utils/httpError";

function validId(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(400, "Invalid id");
}

// ---------- Categories ----------

export const listCategories = asyncHandler(async (req: Request, res: Response) => {
  const categories = await Category.find({ restaurantId: req.restaurantId }).sort({ name: 1 });
  res.json(categories);
});

export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const { name, description, translations } = req.body as { name?: string; description?: string; translations?: unknown };
  if (!name) throw new HttpError(400, "name is required");
  const category = await Category.create({ restaurantId: req.restaurantId, name, description, translations: sanitizeTranslations(translations), isActive: true });
  res.status(201).json(category);
});

export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.id);
  const { name, description, translations } = req.body as { name?: string; description?: string; translations?: unknown };
  const category = await Category.findOneAndUpdate(
    { _id: req.params.id, restaurantId: req.restaurantId },
    { $set: { ...(name !== undefined && { name }), ...(description !== undefined && { description }), ...(translations !== undefined && { translations: sanitizeTranslations(translations) }) } },
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

/** Ratings are set by staff, so clamp rather than reject a slightly-off number. */
function normalizeRating(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(5, Math.max(0, Math.round(n * 10) / 10));
}

/** Clamped like the rating: staff-entered, so a stray value is corrected rather than rejected. */
function normalizePrepTime(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

/** Normalizes admin-supplied modifier groups, dropping malformed entries. */
function sanitizeModifierGroups(value: unknown): { name: string; type: "single" | "multi"; required: boolean; options: { label: string; priceDelta: number }[] }[] {
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

/** Keeps only { name, description } strings under known language keys. */
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
  const { categoryId, subcategoryId, name, price, description, imageUrl, isBestseller, bestsellerEmoji, foodType, rating, prepTimeMinutes, modifierGroups, translations } = req.body as {
    categoryId?: string;
    subcategoryId?: string;
    name?: string;
    price?: number;
    description?: string;
    imageUrl?: string;
    isBestseller?: boolean;
    bestsellerEmoji?: string;
    foodType?: string;
    rating?: number;
    prepTimeMinutes?: number;
    modifierGroups?: unknown;
    translations?: unknown;
  };
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
    foodType: normalizeFoodType(foodType),
    rating: normalizeRating(rating),
    ...(prepTimeMinutes !== undefined && { prepTimeMinutes: normalizePrepTime(prepTimeMinutes) }),
    ...(modifierGroups !== undefined && { modifierGroups: sanitizeModifierGroups(modifierGroups) }),
    ...(translations !== undefined && { translations: sanitizeTranslations(translations) }),
  });
  res.status(201).json(foodItem);
});

export const updateFoodItem = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.id);
  const { categoryId, subcategoryId, name, price, description, imageUrl, isBestseller, bestsellerEmoji, foodType, rating, prepTimeMinutes, modifierGroups, translations } = req.body as {
    categoryId?: string;
    subcategoryId?: string;
    name?: string;
    price?: number;
    description?: string;
    imageUrl?: string;
    isBestseller?: boolean;
    bestsellerEmoji?: string;
    foodType?: string;
    rating?: number;
    prepTimeMinutes?: number;
    modifierGroups?: unknown;
    translations?: unknown;
  };
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
        ...(foodType !== undefined && { foodType: normalizeFoodType(foodType) }),
        ...(rating !== undefined && { rating: normalizeRating(rating) }),
        ...(prepTimeMinutes !== undefined && { prepTimeMinutes: normalizePrepTime(prepTimeMinutes) }),
        ...(modifierGroups !== undefined && { modifierGroups: sanitizeModifierGroups(modifierGroups) }),
        ...(translations !== undefined && { translations: sanitizeTranslations(translations) }),
      },
    },
    { new: true }
  );
  if (!foodItem) throw new HttpError(404, "Food item not found");
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
  res.json(foodItem);
});

// ---------- Public menu (effective-active computed on read, not cascaded on write) ----------

export const getPublicMenu = asyncHandler(async (req: Request, res: Response) => {
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
            price: f.price,
            description: f.description,
            imageUrl: f.imageUrl,
            isBestseller: f.isBestseller,
            bestsellerEmoji: f.bestsellerEmoji,
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
