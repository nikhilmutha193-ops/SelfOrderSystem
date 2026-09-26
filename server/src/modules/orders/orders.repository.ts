import { ClientSession, FilterQuery, HydratedDocument, Types } from "mongoose";

import Admin from "../../models/Admin";
import ChatMessage from "../../models/ChatMessage";
import Coupon from "../../models/Coupon";
import FoodItem from "../../models/FoodItem";
import Order, { IOrder } from "../../models/Order";
import OrderItem, { IOrderItem } from "../../models/OrderItem";
import Restaurant from "../../models/Restaurant";
import TableModel from "../../models/Table";

export type NewOrder = Omit<Partial<IOrder>, "_id" | "restaurantId" | "createdAt" | "updatedAt">;
export type NewOrderItem = Omit<Partial<IOrderItem>, "_id" | "restaurantId" | "createdAt" | "updatedAt">;

export class OrdersRepository {
  constructor(private readonly restaurantId: string) {}

  private scoped<T>(filter: FilterQuery<T> = {}): FilterQuery<T> {
    return { ...filter, restaurantId: this.restaurantId } as FilterQuery<T>;
  }

  findOrder(orderId: string) {
    return Order.findOne(this.scoped<IOrder>({ _id: orderId }));
  }

  createOrder(data: NewOrder) {
    return Order.create({ ...data, restaurantId: this.restaurantId });
  }

  saveOrder(order: HydratedDocument<IOrder>, session?: ClientSession) {
    return order.save({ session });
  }

  async transitionOrder(
    orderId: Types.ObjectId,
    fromStatus: IOrder["status"],
    changes: Partial<IOrder>,
    session?: ClientSession
  ): Promise<boolean> {
    const result = await Order.updateOne(
      this.scoped<IOrder>({ _id: orderId, status: fromStatus }),
      { $set: changes },
      { session }
    );
    return result.modifiedCount === 1;
  }

  findSessionOrder(tableId: Types.ObjectId, sessionId: string) {
    return Order.findOne(this.scoped<IOrder>({ tableId, sessionId, status: { $in: ["open", "billed"] } })).sort({
      createdAt: -1,
    });
  }

  findInvoices(filter: FilterQuery<IOrder>) {
    return Order.find(this.scoped<IOrder>({ ...filter, invoiceNumber: { $type: "string" } }))
      .sort({ billedAt: 1, invoiceNumber: 1 })
      .lean();
  }

  findClosedOrdersWithoutBill() {
    return Order.find(this.scoped<IOrder>({ status: "closed", $or: [{ bill: null }, { bill: { $exists: false } }] }));
  }

  archiveOrders(orderIds: Types.ObjectId[]) {
    return Order.updateMany(this.scoped<IOrder>({ _id: { $in: orderIds } }), { $set: { archivedAt: new Date() } });
  }

  findOrderIdsWithSentItems(orderIds: Types.ObjectId[]) {
    return OrderItem.find(this.scoped<IOrderItem>({ orderId: { $in: orderIds }, kotRound: { $ne: null } })).distinct(
      "orderId"
    );
  }

  findOrdersWithTable(filter: FilterQuery<IOrder>) {
    return Order.find(this.scoped(filter)).sort({ checkinTime: -1 }).populate("tableId", "code").lean();
  }

  findOrdersForClearing(filter: FilterQuery<IOrder>) {
    return Order.find(this.scoped(filter)).select("_id tableId orderType status invoiceNumber");
  }

  async deleteOrdersCascade(orderIds: Types.ObjectId[]) {
    await OrderItem.deleteMany(this.scoped<IOrderItem>({ orderId: { $in: orderIds } }));
    await ChatMessage.deleteMany(this.scoped({ orderId: { $in: orderIds } }));
    await Order.deleteMany(this.scoped<IOrder>({ _id: { $in: orderIds } }));
  }

  findItems(orderId: Types.ObjectId, options: { sorted?: boolean } = {}) {
    const query = OrderItem.find(this.scoped<IOrderItem>({ orderId }));
    return options.sorted ? query.sort({ kotRound: 1, createdAt: 1 }) : query;
  }

  findItemKitchenStates(orderIds: Types.ObjectId[]) {
    return OrderItem.find(this.scoped<IOrderItem>({ orderId: { $in: orderIds } }))
      .select("orderId status kotRound")
      .lean();
  }

  findItem(itemId: string) {
    return OrderItem.findOne(this.scoped<IOrderItem>({ _id: itemId }));
  }

  findItemTotals(orderIds: Types.ObjectId[]) {
    return OrderItem.find(this.scoped<IOrderItem>({ orderId: { $in: orderIds } }))
      .select("orderId status total")
      .lean();
  }

  createItem(data: NewOrderItem) {
    return OrderItem.create({ ...data, restaurantId: this.restaurantId });
  }

  cancelItem(itemId: string, reason?: string, note?: string) {
    return OrderItem.findOneAndUpdate(
      this.scoped<IOrderItem>({ _id: itemId, status: { $ne: "cancelled" } }),
      { $set: { status: "cancelled", cancelReason: reason, cancelNote: note, cancelledAt: new Date() } },
      { new: true }
    );
  }

  cancelPendingItems(orderId: Types.ObjectId) {
    return OrderItem.updateMany(this.scoped<IOrderItem>({ orderId, status: "pending" }), {
      $set: { status: "cancelled" },
    });
  }

  findActiveFoodItems(foodItemIds: string[]) {
    return FoodItem.find(this.scoped({ _id: { $in: foodItemIds }, isActive: true }));
  }

  findTable(tableId: string) {
    return TableModel.findOne(this.scoped({ _id: tableId }));
  }

  occupyTable(tableId: Types.ObjectId) {
    return TableModel.updateOne(this.scoped({ _id: tableId }), {
      $set: { status: "occupied", occupiedAt: new Date() },
    });
  }

  releaseTable(tableId: Types.ObjectId) {
    return TableModel.updateOne(this.scoped({ _id: tableId }), {
      $set: { status: "available" },
      $unset: { sessionId: "", occupiedAt: "" },
    });
  }

  releaseSeatedTables(tableIds: Types.ObjectId[]) {
    return TableModel.updateMany(this.scoped({ _id: { $in: tableIds }, isGuest: false }), {
      $set: { status: "available" },
      $unset: { sessionId: "", occupiedAt: "" },
    });
  }

  findRestaurant(fields?: string) {
    const query = Restaurant.findById(this.restaurantId);
    return fields ? query.select(fields) : query;
  }

  findAdmin(adminId: string) {
    return Admin.findOne(this.scoped({ _id: adminId }));
  }

  findActiveCoupons() {
    return Coupon.find(this.scoped({ isActive: true })).sort({ code: 1 });
  }

  findCoupon(code: string) {
    return Coupon.findOne(this.scoped({ code }));
  }

  async claimCouponUse(couponId: Types.ObjectId, session: ClientSession): Promise<boolean> {
    const result = await Coupon.updateOne(
      this.scoped({
        _id: couponId,
        $or: [{ usageLimit: null }, { $expr: { $lt: ["$usedCount", "$usageLimit"] } }],
      }),
      { $inc: { usedCount: 1 } },
      { session }
    );
    return result.modifiedCount === 1;
  }

  releaseCouponUse(code: string, session?: ClientSession) {
    return Coupon.updateOne(this.scoped({ code, usedCount: { $gt: 0 } }), { $inc: { usedCount: -1 } }, { session });
  }
}
