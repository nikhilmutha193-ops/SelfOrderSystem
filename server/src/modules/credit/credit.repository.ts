import { ClientSession, FilterQuery, Types } from "mongoose";

import CreditEntry, { ICreditEntry } from "../../models/CreditEntry";
import Customer, { ICustomer } from "../../models/Customer";
import Order, { IOrder } from "../../models/Order";

export class CreditRepository {
  constructor(private readonly restaurantId: string) {}

  private scoped<T>(filter: FilterQuery<T> = {}): FilterQuery<T> {
    return { ...filter, restaurantId: this.restaurantId } as FilterQuery<T>;
  }

  findCustomer(id: string | Types.ObjectId) {
    return Customer.findOne(this.scoped<ICustomer>({ _id: id }));
  }

  findOrder(id: string | Types.ObjectId) {
    return Order.findOne(this.scoped<IOrder>({ _id: id })).lean();
  }

  async balance(customerId: Types.ObjectId, session?: ClientSession) {
    const rows = await CreditEntry.aggregate<{ _id: string; total: number }>([
      { $match: { restaurantId: new Types.ObjectId(this.restaurantId), customerId } },
      { $group: { _id: "$type", total: { $sum: "$amount" } } },
    ]).session(session ?? null);
    const by = new Map(rows.map((r) => [r._id, r.total]));
    return (by.get("charge") ?? 0) - (by.get("payment") ?? 0) - (by.get("reverse") ?? 0);
  }

  entries(customerId: Types.ObjectId, limit: number) {
    return CreditEntry.find(this.scoped<ICreditEntry>({ customerId }))
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  entriesForOrder(orderId: Types.ObjectId) {
    return CreditEntry.find(this.scoped<ICreditEntry>({ orderId })).lean();
  }

  async addEntry(data: Partial<ICreditEntry>, session?: ClientSession) {
    const [entry] = await CreditEntry.create([{ ...data, restaurantId: this.restaurantId }], { session });
    return entry;
  }

  setLimit(customerId: string, creditLimit: number | null) {
    return Customer.findOneAndUpdate(this.scoped<ICustomer>({ _id: customerId }), { $set: { creditLimit } }, { new: true });
  }

  touch(customerId: Types.ObjectId, session: ClientSession) {
    return Customer.updateOne(this.scoped<ICustomer>({ _id: customerId }), { $set: { updatedAt: new Date() } }, { session });
  }

  dues() {
    return CreditEntry.aggregate<{ _id: Types.ObjectId; charged: number; paid: number; lastAt: Date }>([
      { $match: { restaurantId: new Types.ObjectId(this.restaurantId) } },
      {
        $group: {
          _id: "$customerId",
          charged: { $sum: { $cond: [{ $eq: ["$type", "charge"] }, "$amount", 0] } },
          paid: { $sum: { $cond: [{ $eq: ["$type", "charge"] }, 0, "$amount"] } },
          lastAt: { $max: "$createdAt" },
        },
      },
    ]);
  }

  customersByIds(ids: Types.ObjectId[]) {
    return Customer.find(this.scoped<ICustomer>({ _id: { $in: ids } }))
      .select("name phone creditLimit")
      .lean();
  }
}
