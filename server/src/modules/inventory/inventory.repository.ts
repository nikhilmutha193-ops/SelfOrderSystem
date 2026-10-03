import { ClientSession, FilterQuery, Types } from "mongoose";

import FoodItem, { IFoodItem } from "../../models/FoodItem";
import OrderItem, { IOrderItem } from "../../models/OrderItem";
import Purchase, { IPurchase } from "../../models/Purchase";
import Recipe, { IRecipe } from "../../models/Recipe";
import Restaurant from "../../models/Restaurant";
import StockCount, { IStockCount } from "../../models/StockCount";
import StockItem, { IStockItem } from "../../models/StockItem";
import StockMovement, { IStockMovement } from "../../models/StockMovement";
import Vendor, { IVendor } from "../../models/Vendor";

export type NewMovement = Omit<IStockMovement, "_id" | "restaurantId" | "createdAt">;

export class InventoryRepository {
  constructor(private readonly restaurantId: string) {}

  private scoped<T>(filter: FilterQuery<T> = {}): FilterQuery<T> {
    return { ...filter, restaurantId: this.restaurantId } as FilterQuery<T>;
  }

  private get restaurantObjectId() {
    return new Types.ObjectId(this.restaurantId);
  }

  findRestaurant(fields: string) {
    return Restaurant.findById(this.restaurantId).select(fields);
  }

  updateInventorySettings(autoSoldOut: boolean) {
    return Restaurant.findByIdAndUpdate(
      this.restaurantId,
      { $set: { "inventorySettings.autoSoldOut": autoSoldOut } },
      { new: true }
    ).select("inventorySettings");
  }

  listStockItems() {
    return StockItem.find(this.scoped<IStockItem>()).sort({ name: 1 }).lean();
  }

  findStockItems(ids: (string | Types.ObjectId)[]) {
    return StockItem.find(this.scoped<IStockItem>({ _id: { $in: ids } })).lean();
  }

  findStockItem(id: string) {
    return StockItem.findOne(this.scoped<IStockItem>({ _id: id }));
  }

  deleteStockItem(id: string) {
    return StockItem.deleteOne(this.scoped<IStockItem>({ _id: id }));
  }

  hasMovements(stockItemId: string) {
    return StockMovement.exists(this.scoped<IStockMovement>({ stockItemId }));
  }

  recipeUsingItem(stockItemId: Types.ObjectId) {
    return Recipe.findOne(
      this.scoped<IRecipe>({
        $or: [{ "lines.stockItemId": stockItemId }, { "modifierLines.stockItemId": stockItemId }],
      })
    )
      .select("foodItemId")
      .lean();
  }

  createStockItem(data: Partial<IStockItem>) {
    return StockItem.create({ ...data, restaurantId: this.restaurantId });
  }

  setAvgCost(id: Types.ObjectId, avgCost: number, session?: ClientSession) {
    return StockItem.updateOne(this.scoped<IStockItem>({ _id: id }), { $set: { avgCost } }, { session });
  }

  async onHand(ids?: Types.ObjectId[], session?: ClientSession): Promise<Map<string, number>> {
    const rows = await StockMovement.aggregate<{ _id: Types.ObjectId; qty: number }>([
      { $match: { restaurantId: this.restaurantObjectId, ...(ids && { stockItemId: { $in: ids } }) } },
      { $group: { _id: "$stockItemId", qty: { $sum: "$quantity" } } },
    ]).session(session ?? null);
    return new Map(rows.map((r) => [r._id.toString(), r.qty]));
  }

  insertMovements(movements: NewMovement[], session?: ClientSession) {
    if (movements.length === 0) return Promise.resolve([]);
    return StockMovement.insertMany(
      movements.map((m) => ({ ...m, restaurantId: this.restaurantId })),
      { session }
    );
  }

  movementsForItem(stockItemId: string, limit: number) {
    return StockMovement.find(this.scoped<IStockMovement>({ stockItemId }))
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean();
  }

  movementsForOrderItems(orderItemIds: Types.ObjectId[]) {
    return StockMovement.find(this.scoped<IStockMovement>({ orderItemId: { $in: orderItemIds } })).lean();
  }

  usageBetween(start: Date, end: Date) {
    return StockMovement.aggregate<{ _id: { stockItemId: Types.ObjectId; type: string }; qty: number; value: number }>([
      { $match: { restaurantId: this.restaurantObjectId, createdAt: { $gte: start, $lt: end } } },
      {
        $group: {
          _id: { stockItemId: "$stockItemId", type: "$type" },
          qty: { $sum: "$quantity" },
          value: { $sum: { $multiply: ["$quantity", "$unitCost"] } },
        },
      },
    ]);
  }

  listRecipes() {
    return Recipe.find(this.scoped<IRecipe>()).lean();
  }

  findRecipesForFoods(foodItemIds: Types.ObjectId[]) {
    return Recipe.find(this.scoped<IRecipe>({ foodItemId: { $in: foodItemIds } })).lean();
  }

  findRecipe(foodItemId: string) {
    return Recipe.findOne(this.scoped<IRecipe>({ foodItemId })).lean();
  }

  saveRecipe(foodItemId: string, data: Pick<IRecipe, "lines" | "modifierLines">) {
    return Recipe.findOneAndUpdate(
      this.scoped<IRecipe>({ foodItemId }),
      { $set: { ...data, foodItemId, restaurantId: this.restaurantId } },
      { new: true, upsert: true }
    ).lean();
  }

  deleteRecipe(foodItemId: string) {
    return Recipe.deleteOne(this.scoped<IRecipe>({ foodItemId }));
  }

  recipesUsingKeyItems(stockItemIds: Types.ObjectId[]) {
    return Recipe.find(
      this.scoped<IRecipe>({ lines: { $elemMatch: { stockItemId: { $in: stockItemIds }, key: true } } })
    ).lean();
  }

  listFoods() {
    return FoodItem.find(this.scoped<IFoodItem>())
      .select("name price isActive soldOutByStock modifierGroups categoryId")
      .sort({ name: 1 })
      .lean();
  }

  findFood(id: string) {
    return FoodItem.findOne(this.scoped<IFoodItem>({ _id: id }))
      .select("name modifierGroups")
      .lean();
  }

  markSoldOut(foodItemIds: Types.ObjectId[]) {
    return FoodItem.updateMany(this.scoped<IFoodItem>({ _id: { $in: foodItemIds }, isActive: true }), {
      $set: { isActive: false, soldOutByStock: true },
    });
  }

  soldOutFoods() {
    return FoodItem.find(this.scoped<IFoodItem>({ soldOutByStock: true }))
      .select("_id")
      .lean();
  }

  restoreFoods(foodItemIds: Types.ObjectId[]) {
    return FoodItem.updateMany(this.scoped<IFoodItem>({ _id: { $in: foodItemIds }, soldOutByStock: true }), {
      $set: { isActive: true, soldOutByStock: false },
    });
  }

  findOrderItems(ids: (string | Types.ObjectId)[]) {
    return OrderItem.find(this.scoped<IOrderItem>({ _id: { $in: ids } }))
      .select("orderId foodItemId foodName quantity modifiers status components")
      .lean();
  }

  findItemsOfOrder(orderId: string) {
    return OrderItem.find(this.scoped<IOrderItem>({ orderId })).select("_id status").lean();
  }

  listVendors() {
    return Vendor.find(this.scoped<IVendor>()).sort({ name: 1 }).lean();
  }

  findVendor(id: string) {
    return Vendor.findOne(this.scoped<IVendor>({ _id: id }));
  }

  createVendor(data: Partial<IVendor>) {
    return Vendor.create({ ...data, restaurantId: this.restaurantId });
  }

  async createPurchase(data: Partial<IPurchase>, session: ClientSession) {
    const [purchase] = await Purchase.create([{ ...data, restaurantId: this.restaurantId }], { session });
    return purchase;
  }

  listPurchases(start: Date, end: Date) {
    return Purchase.find(this.scoped<IPurchase>({ purchasedAt: { $gte: start, $lt: end } }))
      .sort({ purchasedAt: -1, createdAt: -1 })
      .lean();
  }

  async createCount(data: Partial<IStockCount>, session: ClientSession) {
    const [count] = await StockCount.create([{ ...data, restaurantId: this.restaurantId }], { session });
    return count;
  }

  listCounts(limit: number) {
    return StockCount.find(this.scoped<IStockCount>()).sort({ countedAt: -1 }).limit(limit).lean();
  }
}
