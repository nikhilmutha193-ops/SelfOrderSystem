import { FilterQuery, Types } from "mongoose";

import Admin, { IAdmin } from "../../models/Admin";
import Category, { ICategory } from "../../models/Category";
import FoodItem, { IFoodItem } from "../../models/FoodItem";
import Order, { IOfflineSync, IOrder } from "../../models/Order";
import OrderItem from "../../models/OrderItem";
import Restaurant from "../../models/Restaurant";
import Subcategory, { ISubcategory } from "../../models/Subcategory";
import TableModel, { ITable } from "../../models/Table";

export interface ItemSummary {
  _id: Types.ObjectId;
  itemCount: number;
  subtotal: number;
  unsent: number;
  ready: number;
}

export class PosRepository {
  constructor(private readonly restaurantId: string) {}

  private scoped<T>(filter: FilterQuery<T> = {}): FilterQuery<T> {
    return { ...filter, restaurantId: this.restaurantId } as FilterQuery<T>;
  }

  activeCategories() {
    return Category.find(this.scoped<ICategory>({ isActive: true }))
      .select("name defaultStationId")
      .sort({ name: 1 })
      .lean();
  }

  activeSubcategories() {
    return Subcategory.find(this.scoped<ISubcategory>({ isActive: true }))
      .select("categoryId")
      .lean();
  }

  activeFoodItems() {
    return FoodItem.find(this.scoped<IFoodItem>({ isActive: true }))
      .select(
        "name price categoryId subcategoryId foodType shortCode modifierGroups stationId isBestseller priceRules packagingCharge comboItems"
      )
      .sort({ name: 1 })
      .lean();
  }

  countActiveFoodItems(ids: string[]) {
    return FoodItem.countDocuments(this.scoped<IFoodItem>({ _id: { $in: ids }, isActive: true }));
  }

  findOfflineOrder(clientId: string) {
    return Order.findOne(this.scoped<IOrder>({ "offline.clientId": clientId }));
  }

  markOffline(orderId: Types.ObjectId, offline: IOfflineSync) {
    return Order.updateOne(this.scoped<IOrder>({ _id: orderId }), {
      $set: { offline, checkinTime: offline.createdAt },
    });
  }

  flagOffline(orderId: Types.ObjectId, note: string) {
    return Order.updateOne(this.scoped<IOrder>({ _id: orderId }), {
      $set: { "offline.mismatch": true, "offline.note": note },
    });
  }

  markItemsServed(orderId: Types.ObjectId) {
    return OrderItem.updateMany(
      { orderId, restaurantId: this.restaurantId, status: { $in: ["pending", "preparing", "ready"] } },
      { $set: { status: "served" } }
    );
  }

  billingInfo() {
    return Restaurant.findById(this.restaurantId)
      .select("name address gstin taxRates billingSettings.serviceChargePercent invoiceSettings.footerNote")
      .lean();
  }

  areas() {
    return Restaurant.findById(this.restaurantId).select("areas").lean();
  }

  floorTables() {
    return TableModel.find(this.scoped<ITable>({ isGuest: { $ne: true } }))
      .select("code status occupiedAt captainId areaId")
      .sort({ code: 1 })
      .lean();
  }

  captainNames(ids: Types.ObjectId[]) {
    return Admin.find(this.scoped<IAdmin>({ _id: { $in: ids } }))
      .select("username")
      .lean();
  }

  runningOrders() {
    return Order.find(
      this.scoped<IOrder>({
        status: { $in: ["open", "billed"] },
        orderType: { $in: ["dine-in", "takeaway"] },
        archivedAt: null,
      })
    )
      .select("orderType tableId customerName status invoiceNumber createdAt bill.grandTotal")
      .sort({ createdAt: 1 })
      .lean();
  }

  itemSummaries(orderIds: Types.ObjectId[]) {
    return OrderItem.aggregate<ItemSummary>([
      {
        $match: {
          restaurantId: new Types.ObjectId(this.restaurantId),
          orderId: { $in: orderIds },
          status: { $ne: "cancelled" },
        },
      },
      {
        $group: {
          _id: "$orderId",
          itemCount: { $sum: "$quantity" },
          subtotal: { $sum: "$total" },
          unsent: { $sum: { $cond: [{ $eq: ["$kotRound", null] }, 1, 0] } },
          ready: { $sum: { $cond: [{ $eq: ["$status", "ready"] }, 1, 0] } },
        },
      },
    ]);
  }
}
