import { Request, Response } from "express";
import { Types } from "mongoose";

import { asyncHandler } from "../middleware/errorHandler";
import ChatMessage from "../models/ChatMessage";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import Refund from "../models/Refund";
import Restaurant from "../models/Restaurant";
import TableModel from "../models/Table";
import { lowStockCount } from "../modules/inventory/inventory.service";
import { getBusinessDayStart } from "../utils/businessDay";
import { computeInvoiceTotals } from "../utils/invoice";

export const getDashboardSummary = asyncHandler(async (req: Request, res: Response) => {
  const restaurant = await Restaurant.findById(req.restaurantId).select("dayEndTime timezone taxRates serviceFlow");
  const businessDayStart = getBusinessDayStart(new Date(), restaurant?.dayEndTime, restaurant?.timezone);

  const [openOrdersToday, closedToday, pendingKotItems, unreadChatCount, tablesAwaitingPayment, lowStockItems] =
    await Promise.all([
      Order.countDocuments({
        restaurantId: req.restaurantId,
        status: { $in: ["open", "billed"] },
        checkinTime: { $gte: businessDayStart },
      }),
      Order.find({ restaurantId: req.restaurantId, status: "closed", checkoutTime: { $gte: businessDayStart } }),
      OrderItem.countDocuments({ restaurantId: req.restaurantId, status: "pending", kotRound: null }),
      ChatMessage.countDocuments({ restaurantId: req.restaurantId, senderRole: "table", readByAdmin: false }),
      TableModel.countDocuments({ restaurantId: req.restaurantId, status: "awaiting_payment" }),
      lowStockCount(req.restaurantId!),
    ]);

  // Cafe flow: unsent items are orders waiting for payment, not work for the kitchen, and no table waits to pay.
  const cafe = restaurant?.serviceFlow === "cafe";
  const unsentOrderIds = cafe
    ? await OrderItem.distinct("orderId", { restaurantId: req.restaurantId, status: "pending", kotRound: null })
    : [];
  const ordersAwaitingPayment = cafe
    ? await Order.countDocuments({
        restaurantId: req.restaurantId,
        status: { $in: ["open", "billed"] },
        _id: { $in: unsentOrderIds },
      })
    : 0;
  const [refundRow] = await Refund.aggregate<{ total: number }>([
    {
      $match: {
        restaurantId: new Types.ObjectId(String(req.restaurantId)),
        createdAt: { $gte: businessDayStart },
      },
    },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  const refundsToday = Math.round((refundRow?.total ?? 0) * 100) / 100;

  const legacyIds = closedToday.filter((o) => !o.bill).map((o) => o._id);
  const legacyItems = await OrderItem.find({ orderId: { $in: legacyIds } }).select("orderId status total");
  const salesToday = closedToday.reduce((sum, order) => {
    if (order.bill) return sum + order.bill.grandTotal;
    const items = legacyItems.filter((i) => i.orderId.equals(order._id));
    return sum + computeInvoiceTotals(items, restaurant?.taxRates || [], order.discountAmount).grandTotal;
  }, 0);

  res.json({
    openOrdersToday,
    closedOrdersToday: closedToday.length,
    // Net of refunds given back today.
    salesToday: Math.round((salesToday - refundsToday) * 100) / 100,
    refundsToday,
    serviceFlow: restaurant?.serviceFlow ?? "restaurant",
    ordersAwaitingPayment,
    pendingKotItems: cafe ? 0 : pendingKotItems,
    unreadChatCount,
    tablesAwaitingPayment: cafe ? 0 : tablesAwaitingPayment,
    lowStockItems,
    businessDayStart,
  });
});
