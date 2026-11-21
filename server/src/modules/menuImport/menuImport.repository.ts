import { ClientSession, Types } from "mongoose";

import Category from "../../models/Category";
import FoodItem from "../../models/FoodItem";
import Station from "../../models/Station";
import Subcategory from "../../models/Subcategory";

/** The only place the menu import touches Mongoose. Every query is for one restaurant. */
export class MenuImportRepository {
  constructor(private readonly restaurantId: string) {}

  categories() {
    return Category.find({ restaurantId: this.restaurantId }).select("name").lean();
  }

  subcategories() {
    return Subcategory.find({ restaurantId: this.restaurantId }).select("name categoryId").lean();
  }

  stations() {
    return Station.find({ restaurantId: this.restaurantId }).select("name").lean();
  }

  foodItems() {
    return FoodItem.find({ restaurantId: this.restaurantId })
      .select(
        "name categoryId subcategoryId price description imageUrl isActive isBestseller isTodaySpecial jainAvailable spiceAdjustable foodType prepTimeMinutes stationId shortCode packagingCharge priceRules"
      )
      .sort({ name: 1 })
      .lean();
  }

  async createCategories(names: string[], session: ClientSession) {
    if (names.length === 0) return [];
    return Category.insertMany(
      names.map((name) => ({ restaurantId: this.restaurantId, name })),
      { session }
    );
  }

  async createSubcategories(items: { categoryId: Types.ObjectId; name: string }[], session: ClientSession) {
    if (items.length === 0) return [];
    return Subcategory.insertMany(
      items.map((i) => ({ restaurantId: this.restaurantId, categoryId: i.categoryId, name: i.name })),
      { session }
    );
  }

  async insertFoodItems(docs: Record<string, unknown>[], session: ClientSession) {
    if (docs.length === 0) return;
    await FoodItem.insertMany(
      docs.map((doc) => ({ ...doc, restaurantId: this.restaurantId })),
      { session }
    );
  }

  async updateFoodItems(updates: { id: Types.ObjectId; set: Record<string, unknown> }[], session: ClientSession) {
    if (updates.length === 0) return;
    await FoodItem.bulkWrite(
      updates.map((u) => ({
        updateOne: { filter: { _id: u.id, restaurantId: this.restaurantId }, update: { $set: u.set } },
      })),
      { session }
    );
  }

  async hideFoodItems(ids: Types.ObjectId[], session: ClientSession) {
    if (ids.length === 0) return;
    await FoodItem.updateMany(
      { _id: { $in: ids }, restaurantId: this.restaurantId },
      { $set: { isActive: false } },
      { session }
    );
  }
}
