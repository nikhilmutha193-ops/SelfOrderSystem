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
  const { name, description } = req.body as { name?: string; description?: string };
  if (!name) throw new HttpError(400, "name is required");
  const category = await Category.create({ restaurantId: req.restaurantId, name, description, isActive: true });
  res.status(201).json(category);
});

export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.id);
  const { name, description } = req.body as { name?: string; description?: string };
  const category = await Category.findOneAndUpdate(
    { _id: req.params.id, restaurantId: req.restaurantId },
    { $set: { ...(name !== undefined && { name }), ...(description !== undefined && { description }) } },
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
  const { categoryId, name, description } = req.body as {
    categoryId?: string;
    name?: string;
    description?: string;
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
    isActive: true,
  });
  res.status(201).json(subcategory);
});

export const updateSubcategory = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.id);
  const { categoryId, name, description } = req.body as {
    categoryId?: string;
    name?: string;
    description?: string;
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

export const createFoodItem = asyncHandler(async (req: Request, res: Response) => {
  const { categoryId, subcategoryId, name, price, description, imageUrl, isBestseller, bestsellerEmoji } = req.body as {
    categoryId?: string;
    subcategoryId?: string;
    name?: string;
    price?: number;
    description?: string;
    imageUrl?: string;
    isBestseller?: boolean;
    bestsellerEmoji?: string;
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
  });
  res.status(201).json(foodItem);
});

export const updateFoodItem = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.id);
  const { categoryId, subcategoryId, name, price, description, imageUrl, isBestseller, bestsellerEmoji } = req.body as {
    categoryId?: string;
    subcategoryId?: string;
    name?: string;
    price?: number;
    description?: string;
    imageUrl?: string;
    isBestseller?: boolean;
    bestsellerEmoji?: string;
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
    subcategories: visibleSubcategories
      .filter((s) => s.categoryId.toString() === category._id.toString())
      .map((subcategory) => ({
        _id: subcategory._id,
        name: subcategory.name,
        description: subcategory.description,
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
          })),
      })),
  }));

  res.json(menu);
});
