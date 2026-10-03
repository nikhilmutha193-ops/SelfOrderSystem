import { FilterQuery, Types } from "mongoose";

import Category, { ICategory } from "../../models/Category";
import FoodItem, { IFoodItem } from "../../models/FoodItem";
import OrderItem from "../../models/OrderItem";
import Subcategory, { ISubcategory } from "../../models/Subcategory";

export class RecommendationsRepository {
  constructor(private readonly restaurantId: string) {}

  private scoped<T>(filter: FilterQuery<T> = {}): FilterQuery<T> {
    return { ...filter, restaurantId: this.restaurantId } as FilterQuery<T>;
  }

  async visibleFoods() {
    const [categories, subcategories, foods] = await Promise.all([
      Category.find(this.scoped<ICategory>({ isActive: true })).select("_id").lean(),
      Subcategory.find(this.scoped<ISubcategory>({ isActive: true })).select("_id categoryId").lean(),
      FoodItem.find(this.scoped<IFoodItem>({ isActive: true })).select("categoryId subcategoryId pairsWith isBestseller").lean(),
    ]);
    const activeCategories = new Set(categories.map((c) => c._id.toString()));
    const activeSubcategories = new Set(
      subcategories.filter((s) => activeCategories.has(s.categoryId.toString())).map((s) => s._id.toString())
    );
    return foods.filter(
      (f) => activeCategories.has(f.categoryId.toString()) && activeSubcategories.has(f.subcategoryId.toString())
    );
  }

  popularSince(since: Date, foodIds: Types.ObjectId[]) {
    return OrderItem.aggregate<{ _id: Types.ObjectId; qty: number }>([
      {
        $match: {
          restaurantId: new Types.ObjectId(this.restaurantId),
          createdAt: { $gte: since },
          status: { $ne: "cancelled" },
          foodItemId: { $in: foodIds },
        },
      },
      { $group: { _id: "$foodItemId", qty: { $sum: "$quantity" } } },
      { $sort: { qty: -1 } },
      { $limit: 12 },
    ]);
  }

  basketsSince(since: Date) {
    return OrderItem.aggregate<{ _id: Types.ObjectId; foods: Types.ObjectId[] }>([
      {
        $match: {
          restaurantId: new Types.ObjectId(this.restaurantId),
          createdAt: { $gte: since },
          status: { $ne: "cancelled" },
          foodItemId: { $ne: null },
        },
      },
      { $group: { _id: "$orderId", foods: { $addToSet: "$foodItemId" } } },
      { $match: { "foods.1": { $exists: true } } },
      { $limit: 5000 },
    ]);
  }
}
