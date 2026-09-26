import "dotenv/config";

import mongoose from "mongoose";

import { connectDb } from "../config/db";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import Restaurant from "../models/Restaurant";
import { snapshotFromTotals } from "../modules/orders/orders.billing";
import { computeInvoiceTotals } from "./invoice";
import { describeError, logger } from "./logger";

export async function backfillLegacyBills(): Promise<number> {
  let updated = 0;
  const restaurants = await Restaurant.find().select("taxRates invoiceSettings");
  for (const restaurant of restaurants) {
    const orders = await Order.find({
      restaurantId: restaurant._id,
      status: "closed",
      $or: [{ bill: null }, { bill: { $exists: false } }],
    }).select("_id discountAmount couponCode");

    for (const order of orders) {
      const items = await OrderItem.find({ orderId: order._id }).select("status total");
      const totals = computeInvoiceTotals(items, restaurant.taxRates, order.discountAmount);
      const bill = snapshotFromTotals(totals, restaurant, order.couponCode, true);
      const result = await Order.updateOne(
        { _id: order._id, $or: [{ bill: null }, { bill: { $exists: false } }] },
        { $set: { bill } }
      );
      updated += result.modifiedCount;
    }
  }
  return updated;
}

if (require.main === module) {
  connectDb()
    .then(backfillLegacyBills)
    .then(async (count) => {
      logger.info("backfill: saved legacy bill totals", { orders: count });
      await mongoose.disconnect();
    })
    .catch(async (err) => {
      logger.error("backfill: failed", describeError(err));
      await mongoose.disconnect();
      process.exit(1);
    });
}
