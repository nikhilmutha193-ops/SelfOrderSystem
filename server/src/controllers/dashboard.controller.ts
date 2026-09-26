import { Request, Response } from "express";

import { asyncHandler } from "../middleware/errorHandler";
import ChatMessage from "../models/ChatMessage";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import Restaurant from "../models/Restaurant";
import { getBusinessDayStart } from "../utils/businessDay";
import { computeInvoiceTotals } from "../utils/invoice";

export const getDashboardSummary = asyncHandler(async (req: Request, res: Response) => {
  const restaurant = await Restaurant.findById(req.restaurantId).select("dayEndTime timezone taxRates");
  const businessDayStart = getBusinessDayStart(new Date(), restaurant?.dayEndTime, restaurant?.timezone);

  const [openOrdersToday, closedToday, pendingKotItems, unreadChatCount] = await Promise.all([
    Order.countDocuments({
      restaurantId: req.restaurantId,
      status: { $in: ["open", "billed"] },
      checkinTime: { $gte: businessDayStart },
    }),
    Order.find({ restaurantId: req.restaurantId, status: "closed", checkoutTime: { $gte: businessDayStart } }),
    OrderItem.countDocuments({ restaurantId: req.restaurantId, status: "pending", kotRound: null }),
    ChatMessage.countDocuments({ restaurantId: req.restaurantId, senderRole: "table", readByAdmin: false }),
  ]);

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
    salesToday: Math.round(salesToday * 100) / 100,
    pendingKotItems,
    unreadChatCount,
    businessDayStart,
  });
});
