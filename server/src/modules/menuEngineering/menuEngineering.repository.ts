import { FilterQuery, Types } from "mongoose";

import Category, { ICategory } from "../../models/Category";
import FoodItem, { IFoodItem } from "../../models/FoodItem";
import Order, { IOrder } from "../../models/Order";
import OrderItem, { IOrderItem } from "../../models/OrderItem";
import Recipe, { IRecipe } from "../../models/Recipe";
import StockItem, { IStockItem } from "../../models/StockItem";

export class MenuEngineeringRepository {
  constructor(private readonly restaurantId: string) {}

  private scoped<T>(filter: FilterQuery<T> = {}): FilterQuery<T> {
    return { ...filter, restaurantId: this.restaurantId } as FilterQuery<T>;
  }

  paidOrderIdsSince(since: Date) {
    return Order.find(this.scoped<IOrder>({ status: "closed", checkoutTime: { $gte: since } }))
      .select("_id")
      .lean();
  }

  soldItems(orderIds: Types.ObjectId[]) {
    return OrderItem.find(this.scoped<IOrderItem>({ orderId: { $in: orderIds }, status: { $ne: "cancelled" } }))
      .select("foodItemId foodName quantity total complimentary")
      .lean();
  }

  foods() {
    return FoodItem.find(this.scoped<IFoodItem>()).select("name price isActive categoryId comboItems").lean();
  }

  categories() {
    return Category.find(this.scoped<ICategory>()).select("name").lean();
  }

  recipes() {
    return Recipe.find(this.scoped<IRecipe>()).lean();
  }

  stockItems() {
    return StockItem.find(this.scoped<IStockItem>()).select("avgCost").lean();
  }
}
