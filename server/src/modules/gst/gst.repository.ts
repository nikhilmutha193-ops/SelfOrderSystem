import { FilterQuery, Types } from "mongoose";

import Order, { IOrder } from "../../models/Order";
import Refund from "../../models/Refund";
import Restaurant from "../../models/Restaurant";

export class GstRepository {
  constructor(private readonly restaurantId: Types.ObjectId | string) {}

  private scoped<T>(filter: FilterQuery<T> = {}): FilterQuery<T> {
    return { ...filter, restaurantId: this.restaurantId };
  }

  restaurant() {
    return Restaurant.findById(this.restaurantId).select("dayEndTime timezone gstin name").lean();
  }

  /** Refunds given in the period (after-sale money back to guests). */
  async refundsIn(range: { $gte: Date; $lt: Date }) {
    const [row] = await Refund.aggregate<{ count: number; amount: number }>([
      {
        $match: {
          restaurantId: new Types.ObjectId(String(this.restaurantId)),
          createdAt: range,
        },
      },
      { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: "$amount" } } },
    ]);
    return { count: row?.count ?? 0, amount: row?.amount ?? 0 };
  }

  /** Every invoice (number or legacy bill) whose bill date falls in the range, whatever its status. */
  invoices(range: { $gte: Date; $lt: Date }) {
    return Order.find(
      this.scoped<IOrder>({
        $and: [
          { $or: [{ invoiceNumber: { $type: "string" } }, { "bill.legacy": true }] },
          { bill: { $ne: null } },
          { $or: [{ billedAt: range }, { billedAt: null, checkoutTime: range }] },
        ],
      })
    )
      .select(
        "invoiceNumber billedAt checkoutTime customerName customerGstin orderType source status voidedAt paymentMethod bill"
      )
      .sort({ billedAt: 1, checkoutTime: 1, invoiceNumber: 1 })
      .lean();
  }
}
