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
        "name price categoryId subcategoryId foodType shortCode modifierGroups stationId isBestseller jainAvailable spiceAdjustable priceRules packagingCharge comboItems"
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

  findTable(tableId: string) {
    return TableModel.findOne(this.scoped<ITable>({ _id: tableId }));
  }

  billingInfo() {
    return Restaurant.findById(this.restaurantId)
      .select(
        "name address gstin taxRates serviceFlow billingSettings.serviceChargePercent billingSettings.dineInPayment billingSettings.takeawayPayFirst billingSettings.posUseTables invoiceSettings.footerNote"
      )
      .lean();
  }

  areas() {
    return Restaurant.findById(this.restaurantId).select("areas").lean();
  }

  floorTables() {
    // Guest (walk-in) tables are included: several orders can run on them at once.
    return TableModel.find(this.scoped<ITable>({}))
      .select("code status occupiedAt captainId areaId isGuest")
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
      .select("orderType tableId customerName status invoiceNumber createdAt bill.grandTotal source kiosk payAtCounter")
      .sort({ createdAt: 1 })
      .lean();
  }

  /** Every order of the business day (opened, or billed, today): running, billed, paid and cancelled. Newest first. */
  todaysOrders(since: Date) {
    return Order.find(
      this.scoped<IOrder>({
        orderType: { $in: ["dine-in", "takeaway"] },
        archivedAt: null,
        $or: [{ billedAt: { $gte: since } }, { checkinTime: { $gte: since } }],
      })
    )
      .select(
        "orderType tableId customerName customerPhone status invoiceNumber billedAt checkinTime bill.grandTotal paymentMethod payAtCounter source kiosk pickupNumber invoicePrintedAt invoicePrintCount"
      )
      .sort({ billedAt: -1, checkinTime: -1 })
      .limit(500)
      .lean();
  }

  /** Dish counts per order by what happened to them, and the last KOT round that was sent. */
  itemStates(orderIds: Types.ObjectId[]) {
    const count = (match: Record<string, unknown>) => ({ $sum: { $cond: [match, "$quantity", 0] } });
    const live = { $ne: ["$status", "cancelled"] };
    const sent = { $ne: ["$kotRound", null] };
    return OrderItem.aggregate<{
      _id: Types.ObjectId;
      subtotal: number;
      total: number;
      unsent: number;
      waiting: number;
      preparing: number;
      ready: number;
      served: number;
      cancelled: number;
      lastKotRound: number | null;
    }>([
      { $match: { restaurantId: new Types.ObjectId(this.restaurantId), orderId: { $in: orderIds } } },
      {
        $group: {
          _id: "$orderId",
          subtotal: { $sum: { $cond: [live, "$total", 0] } },
          total: count(live),
          unsent: count({ $and: [live, { $eq: ["$kotRound", null] }] }),
          waiting: count({ $and: [{ $eq: ["$status", "pending"] }, sent] }),
          preparing: count({ $eq: ["$status", "preparing"] }),
          ready: count({ $eq: ["$status", "ready"] }),
          served: count({ $eq: ["$status", "served"] }),
          cancelled: count({ $eq: ["$status", "cancelled"] }),
          lastKotRound: { $max: "$kotRound" },
        },
      },
    ]);
  }

  /** The dishes of these orders with what the guest chose (options, Jain, pack, spice and comment in the note). */
  itemLines(orderIds: Types.ObjectId[]) {
    return OrderItem.find({ restaurantId: this.restaurantId, orderId: { $in: orderIds } })
      .select(
        "orderId foodName quantity isJain isPacked modifiers note status kotRound tokenNumber complimentary components"
      )
      .sort({ createdAt: 1 })
      .lean();
  }

  restaurantDay() {
    return Restaurant.findById(this.restaurantId).select("dayEndTime timezone").lean();
  }

  /** The KOT rounds that were sent for an order (one ticket each). */
  async kotRounds(orderId: Types.ObjectId): Promise<number[]> {
    const rounds = (await OrderItem.distinct("kotRound", {
      restaurantId: this.restaurantId,
      orderId,
      kotRound: { $ne: null },
      status: { $ne: "cancelled" },
    })) as number[];
    return rounds.sort((a, b) => a - b);
  }

  async markInvoicePrinted(orderId: Types.ObjectId) {
    await Order.updateOne(this.scoped<IOrder>({ _id: orderId }), {
      $set: { invoicePrintedAt: new Date() },
      $inc: { invoicePrintCount: 1 },
    });
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
