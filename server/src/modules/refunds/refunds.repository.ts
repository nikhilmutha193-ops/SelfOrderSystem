import { ClientSession, FilterQuery, Types } from "mongoose";

import Order, { IOrder } from "../../models/Order";
import OrderItem, { IOrderItem } from "../../models/OrderItem";
import Refund, { IRefund } from "../../models/Refund";
import Restaurant from "../../models/Restaurant";

export class RefundsRepository {
  constructor(private readonly restaurantId: Types.ObjectId | string) {}

  private scoped<T>(filter: FilterQuery<T> = {}): FilterQuery<T> {
    return { ...filter, restaurantId: this.restaurantId } as FilterQuery<T>;
  }

  restaurant() {
    return Restaurant.findById(this.restaurantId).select("dayEndTime timezone").lean();
  }

  itemsOf(orderId: Types.ObjectId) {
    return OrderItem.find(this.scoped<IOrderItem>({ orderId }));
  }

  forOrder(orderId: Types.ObjectId) {
    return Refund.find(this.scoped<IRefund>({ orderId })).sort({ createdAt: -1 }).lean();
  }

  list(filter: FilterQuery<IRefund>) {
    return Refund.find(this.scoped<IRefund>(filter)).sort({ createdAt: -1 }).limit(1000).lean();
  }

  /**
   * Adds to the order's refunded total only while the new total stays within what was paid, so two tills
   * can't refund the same money twice.
   */
  claimRefundAmount(orderId: Types.ObjectId, amount: number, paid: number, session: ClientSession) {
    return Order.findOneAndUpdate(
      this.scoped<IOrder>({ _id: orderId, status: "closed", refundedTotal: { $lte: round(paid - amount) } }),
      { $inc: { refundedTotal: amount } },
      { new: true, session }
    );
  }

  /** Marks units of an item as refunded, never beyond what was ordered. */
  claimItemUnits(itemId: Types.ObjectId, quantity: number, ordered: number, session: ClientSession) {
    return OrderItem.findOneAndUpdate(
      this.scoped<IOrderItem>({ _id: itemId, refundedQty: { $lte: ordered - quantity } }),
      { $inc: { refundedQty: quantity } },
      { new: true, session }
    );
  }

  cancelItem(itemId: Types.ObjectId, session: ClientSession) {
    return OrderItem.updateOne(
      this.scoped<IOrderItem>({ _id: itemId, status: { $ne: "cancelled" } }),
      { $set: { status: "cancelled", cancelReason: "refunded", cancelledAt: new Date() } },
      { session }
    );
  }

  async create(refund: Omit<IRefund, "_id" | "createdAt">, session: ClientSession) {
    const [created] = await Refund.create([{ ...refund, restaurantId: this.restaurantId }], { session });
    return created;
  }
}

const round = (n: number) => Math.round(n * 100) / 100;
