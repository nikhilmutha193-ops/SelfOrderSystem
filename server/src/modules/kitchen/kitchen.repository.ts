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
    const filter: FilterQuery<IOrder> = { status: "open" };
    if (tableId) filter.tableId = tableId;
    return Order.find(this.scoped(filter)).populate("tableId", "code");
  }

  findActiveItems(orderIds: Types.ObjectId[]) {
    return OrderItem.find(
      this.scoped<IOrderItem>({ orderId: { $in: orderIds }, status: { $in: ACTIVE_STATUSES } })
    ).sort({ createdAt: 1 });
  }

  findUnsentItems(orderId: Types.ObjectId) {
    return OrderItem.find(this.scoped<IOrderItem>({ orderId, status: "pending", kotRound: null }));
  }

  findLatestSentItem(orderId: Types.ObjectId) {
    return OrderItem.findOne(this.scoped<IOrderItem>({ orderId, kotRound: { $ne: null } })).sort({ kotRound: -1 });
  }

  markItemsSent(itemIds: Types.ObjectId[], round: number, tokenNumber: number) {
    return OrderItem.updateMany(this.scoped<IOrderItem>({ _id: { $in: itemIds } }), {
      $set: { kotRound: round, tokenNumber, kotPrintedAt: new Date() },
    });
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
