import { FilterQuery, Types } from "mongoose";

import Category from "../../models/Category";
import DayClose, { IDayClose } from "../../models/DayClose";
import FoodItem from "../../models/FoodItem";
import Order, { IOrder } from "../../models/Order";
import OrderItem, { IOrderItem } from "../../models/OrderItem";
import Restaurant from "../../models/Restaurant";
import Shift, { IShift } from "../../models/Shift";

export class ShiftsRepository {
  constructor(private readonly restaurantId: string) {}

  private scoped<T>(filter: FilterQuery<T> = {}): FilterQuery<T> {
    return { ...filter, restaurantId: this.restaurantId } as FilterQuery<T>;
  }

  findRestaurant() {
    return Restaurant.findById(this.restaurantId).select("dayEndTime timezone name");
  }

  findOpenShift() {
    return Shift.findOne(this.scoped<IShift>({ isOpen: true }));
  }

  createShift(data: Partial<IShift>) {
    return Shift.create({ ...data, restaurantId: this.restaurantId });
  }

  listShifts(limit: number) {
    return Shift.find(this.scoped<IShift>()).sort({ openedAt: -1 }).limit(limit).lean();
  }

  findShiftsOverlapping(start: Date, end: Date) {
    return Shift.find(
      this.scoped<IShift>({ openedAt: { $lt: end }, $or: [{ closedAt: null }, { closedAt: { $gte: start } }] })
    )
      .sort({ openedAt: 1 })
      .lean();
  }

  async cashReceivedBetween(start: Date, end: Date): Promise<number> {
    const [row] = await Order.aggregate<{ total: number }>([
      { $match: { restaurantId: new Types.ObjectId(this.restaurantId), status: "closed" } },
      { $unwind: "$payments" },
      { $match: { "payments.method": "cash", "payments.at": { $gte: start, $lt: end } } },
      { $group: { _id: null, total: { $sum: "$payments.amount" } } },
    ]);
    return row?.total ?? 0;
  }

  findPaidOrders(start: Date, end: Date) {
    return Order.find(this.scoped<IOrder>({ status: "closed", checkoutTime: { $gte: start, $lt: end } })).lean();
  }

  findBilledOrders(start: Date, end: Date) {
    return Order.find(this.scoped<IOrder>({ billedAt: { $gte: start, $lt: end }, invoiceNumber: { $type: "string" } }))
      .sort({ invoiceNumber: 1 })
      .lean();
  }

  findVoidedOrders(start: Date, end: Date) {
    return Order.find(this.scoped<IOrder>({ voidedAt: { $gte: start, $lt: end } })).lean();
  }

  findCancelledBills(start: Date, end: Date) {
    return Order.find(
      this.scoped<IOrder>({
        cancelledAt: { $gte: start, $lt: end },
        voidedAt: null,
        invoiceNumber: { $type: "string" },
      })
    ).lean();
  }

  findUnsettledBefore(end: Date) {
    return Order.find(this.scoped<IOrder>({ status: { $in: ["open", "billed"] }, checkinTime: { $lt: end } }))
      .sort({ checkinTime: 1 })
      .lean();
  }

  findItemsForOrders(orderIds: Types.ObjectId[]) {
    return OrderItem.find(this.scoped<IOrderItem>({ orderId: { $in: orderIds }, status: { $ne: "cancelled" } })).lean();
  }

  async categoryNamesForFoods(foodIds: Types.ObjectId[]): Promise<Map<string, string>> {
    const foods = await FoodItem.find(this.scoped({ _id: { $in: foodIds } }))
      .select("categoryId")
      .lean();
    const categories = await Category.find(this.scoped({ _id: { $in: foods.map((f) => f.categoryId) } }))
      .select("name")
      .lean();
    const categoryName = new Map(categories.map((c) => [c._id.toString(), c.name]));
    return new Map(foods.map((f) => [f._id.toString(), categoryName.get(f.categoryId.toString()) ?? "Uncategorised"]));
  }

  findDayClose(businessDate: string) {
    return DayClose.findOne(this.scoped<IDayClose>({ businessDate })).lean();
  }

  createDayClose(data: Partial<IDayClose>) {
    return DayClose.create({ ...data, restaurantId: this.restaurantId });
  }

  listDayCloses(limit: number) {
    return DayClose.find(this.scoped<IDayClose>()).sort({ businessDayStart: -1 }).limit(limit).select("-report").lean();
  }
}
