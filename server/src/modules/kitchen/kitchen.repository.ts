import { FilterQuery, Types } from "mongoose";

import Order, { IOrder } from "../../models/Order";
import OrderItem, { IOrderItem, OrderItemStatus } from "../../models/OrderItem";
import Restaurant from "../../models/Restaurant";
import TableModel from "../../models/Table";

const ACTIVE_STATUSES: OrderItemStatus[] = ["pending", "preparing", "ready"];

export class KitchenRepository {
  constructor(private readonly restaurantId: string) {}

  private scoped<T>(filter: FilterQuery<T> = {}): FilterQuery<T> {
    return { ...filter, restaurantId: this.restaurantId } as FilterQuery<T>;
  }

  findOpenOrdersWithTable(tableId?: string) {
    const filter: FilterQuery<IOrder> = { status: { $in: ["open", "billed"] } };
    if (tableId) filter.tableId = tableId;
    return Order.find(this.scoped(filter)).populate("tableId", "code");
  }

  findActiveItems(orderIds: Types.ObjectId[]) {
    return OrderItem.find(
      this.scoped<IOrderItem>({ orderId: { $in: orderIds }, status: { $in: ACTIVE_STATUSES } })
    ).sort({ createdAt: 1 });
  }

  hasUnsentItems(orderId: Types.ObjectId) {
    return OrderItem.exists(this.scoped<IOrderItem>({ orderId, status: "pending", kotRound: null }));
  }

  async nextKotRound(orderId: Types.ObjectId): Promise<number> {
    const latest = await OrderItem.findOne(this.scoped<IOrderItem>({ orderId, kotRound: { $ne: null } }))
      .sort({ kotRound: -1 })
      .select("kotRound");
    await Order.updateOne(this.scoped<IOrder>({ _id: orderId }), { $max: { kotSeq: latest?.kotRound ?? 0 } });
    const order = await Order.findOneAndUpdate(
      this.scoped<IOrder>({ _id: orderId }),
      { $inc: { kotSeq: 1 } },
      { new: true, projection: { kotSeq: 1 } }
    );
    return order!.kotSeq!;
  }

  async claimUnsentItems(orderId: Types.ObjectId, round: number): Promise<number> {
    const result = await OrderItem.updateMany(this.scoped<IOrderItem>({ orderId, status: "pending", kotRound: null }), {
      $set: { kotRound: round, kotPrintedAt: new Date() },
    });
    return result.modifiedCount;
  }

  setRoundToken(orderId: Types.ObjectId, round: number, tokenNumber: number) {
    return OrderItem.updateMany(this.scoped<IOrderItem>({ orderId, kotRound: round }), { $set: { tokenNumber } });
  }

  findRoundItems(orderId: Types.ObjectId, round: number) {
    return OrderItem.find(this.scoped<IOrderItem>({ orderId, kotRound: round }));
  }

  transitionItem(itemId: string, from: FilterQuery<IOrderItem>, update: Partial<IOrderItem>) {
    return OrderItem.findOneAndUpdate(
      this.scoped<IOrderItem>({ _id: itemId, ...from }),
      { $set: update },
      { new: true }
    );
  }

  findRestaurant(fields?: string) {
    const query = Restaurant.findById(this.restaurantId);
    return fields ? query.select(fields) : query;
  }

  findTableCode(tableId: Types.ObjectId) {
    return TableModel.findOne(this.scoped({ _id: tableId })).select("code");
  }
}
