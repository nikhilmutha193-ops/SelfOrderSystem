import { Request, Response } from "express";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import ChatMessage from "../models/ChatMessage";
import Restaurant from "../models/Restaurant";
import { asyncHandler } from "../middleware/errorHandler";
import { getBusinessDayStart } from "../utils/businessDay";

export const getDashboardSummary = asyncHandler(async (req: Request, res: Response) => {
  const restaurant = await Restaurant.findById(req.restaurantId).select("dayEndTime timezone");
  const businessDayStart = getBusinessDayStart(new Date(), restaurant?.dayEndTime, restaurant?.timezone);

  const [openOrdersToday, closedToday, pendingKotItems, unreadChatCount] = await Promise.all([
    Order.countDocuments({ restaurantId: req.restaurantId, status: "open", checkinTime: { $gte: businessDayStart } }),
    Order.find({ restaurantId: req.restaurantId, status: "closed", checkoutTime: { $gte: businessDayStart } }),
    OrderItem.countDocuments({ restaurantId: req.restaurantId, status: "pending", kotRound: null }),
    ChatMessage.countDocuments({ restaurantId: req.restaurantId, senderRole: "table", readByAdmin: false }),
  ]);

  const closedOrderIds = closedToday.map((o) => o._id);
  const closedItems = await OrderItem.find({ orderId: { $in: closedOrderIds }, status: { $ne: "cancelled" } });
  const salesToday = closedItems.reduce((sum, i) => sum + i.total, 0);

  res.json({
    openOrdersToday,
    closedOrdersToday: closedToday.length,
    salesToday: Math.round(salesToday * 100) / 100,
    pendingKotItems,
    unreadChatCount,
    businessDayStart,
  });
});
