import { ClientSession, Types } from "mongoose";

import Category from "../../models/Category";
import FoodItem from "../../models/FoodItem";
import FoodReview from "../../models/FoodReview";
import Recipe from "../../models/Recipe";
import Subcategory from "../../models/Subcategory";

/** The only place removing menu entries touches Mongoose. Every query is for one restaurant. */
export class MenuRemoveRepository {
  constructor(private readonly restaurantId: string) {}

  findFood(id: string) {
    return FoodItem.findOne({ _id: id, restaurantId: this.restaurantId }).select("name isActive").lean();
  }

  findSubcategory(id: string) {
    return Subcategory.findOne({ _id: id, restaurantId: this.restaurantId }).select("name categoryId").lean();
  }

  findCategory(id: string) {
    return Category.findOne({ _id: id, restaurantId: this.restaurantId }).select("name").lean();
  }

  subcategoryIdsOf(categoryId: Types.ObjectId | string) {
    return Subcategory.find({ restaurantId: this.restaurantId, categoryId }).select("_id").lean();
  }

  /** The dishes under a category or subcategory, with whether each is switched on. */
  dishesIn(scope: { categoryId: Types.ObjectId | string } | { subcategoryId: Types.ObjectId | string }) {
    return FoodItem.find({ restaurantId: this.restaurantId, ...scope })
      .select("name isActive")
      .lean();
  }

  /** Dishes outside `ids` that have one of `ids` as a combo component. */
  combosUsing(ids: Types.ObjectId[]) {
    return FoodItem.find({
      restaurantId: this.restaurantId,
      "comboItems.foodItemId": { $in: ids },
      _id: { $nin: ids },
    })
      .select("name")
      .lean();
  }

  async deleteFoods(ids: Types.ObjectId[], session: ClientSession) {
    if (ids.length === 0) return;
    const scope = { restaurantId: this.restaurantId };
    await Recipe.deleteMany({ ...scope, foodItemId: { $in: ids } }, { session });
    await FoodReview.deleteMany({ ...scope, foodItemId: { $in: ids } }, { session });
    // Other dishes that suggested one of these as a pairing just lose that suggestion.
    await FoodItem.updateMany({ ...scope, pairsWith: { $in: ids } }, { $pull: { pairsWith: { $in: ids } } }, { session });
    await FoodItem.deleteMany({ ...scope, _id: { $in: ids } }, { session });
  }

  async deleteSubcategories(ids: Types.ObjectId[], session: ClientSession) {
    if (ids.length === 0) return;
    await Subcategory.deleteMany({ restaurantId: this.restaurantId, _id: { $in: ids } }, { session });
  }

  async deleteCategory(id: Types.ObjectId, session: ClientSession) {
    await Category.deleteOne({ restaurantId: this.restaurantId, _id: id }, { session });
  }
}
