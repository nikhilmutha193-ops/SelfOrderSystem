import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import Restaurant from "../models/Restaurant";
import TableModel from "../models/Table";
import { paysUpfront } from "./dineInPayment";
import { describeError, logger } from "./logger";
import { cancelUnsentOrdersForTables } from "./tableRelease";
import { syncTableState } from "./tableState";

const CHECK_INTERVAL_MS = 60 * 1000;

/** Pay-first: minutes after everything on the table is paid and served before the table is released. */
export const SERVED_RELEASE_MINUTES = 2;

/**
 * In pay-first service (cafe, or dine-in paid upfront) a table whose orders are all paid and every dish served
 * is released a couple of minutes later, so the next guest can sit down. A guest can also release it sooner.
 */
export async function releaseServedPayFirstTables(): Promise<void> {
  const seated = await TableModel.find({
    isGuest: false,
    status: "occupied",
    sessionId: { $exists: true, $nin: [null, ""] },
  }).select("restaurantId sessionId");
  if (seated.length === 0) return;

  const restaurantIds = [...new Set(seated.map((t) => t.restaurantId.toString()))];
  const restaurants = await Restaurant.find({ _id: { $in: restaurantIds } }).select(
    "billingSettings.dineInPayment serviceFlow"
  );
  const payFirst = new Set(restaurants.filter((r) => paysUpfront(r)).map((r) => r._id.toString()));
  const cutoff = Date.now() - SERVED_RELEASE_MINUTES * 60 * 1000;

  for (const table of seated.filter((t) => payFirst.has(t.restaurantId.toString()))) {
    try {
      const orders = await Order.find({
        restaurantId: table.restaurantId,
        tableId: table._id,
        sessionId: table.sessionId,
        status: { $ne: "cancelled" },
      }).select("status updatedAt");
      if (orders.length === 0) continue;
      const items = await OrderItem.find({
        restaurantId: table.restaurantId,
        orderId: { $in: orders.map((o) => o._id) },
        status: { $ne: "cancelled" },
      }).select("orderId status updatedAt");
      if (items.length === 0) continue;

      // An order with dishes that is still open or billed is unpaid; an empty one doesn't hold the table.
      const withItems = new Set(items.map((i) => i.orderId.toString()));
      if (orders.some((o) => o.status !== "closed" && withItems.has(o._id.toString()))) continue;
      if (items.some((i) => i.status !== "served")) continue;

      const lastChange = Math.max(...items.map((i) => i.updatedAt.getTime()), ...orders.map((o) => o.updatedAt.getTime()));
      if (lastChange > cutoff) continue;

      await cancelUnsentOrdersForTables([table._id]);
      await syncTableState(table._id, { endSession: true });
      logger.info("table-release-scheduler: released a paid and served table", {
        restaurantId: table.restaurantId.toString(),
        tableId: table._id.toString(),
      });
    } catch (err) {
      logger.error("table-release-scheduler: served release failed", { tableId: table._id.toString(), ...describeError(err) });
    }
  }
}

export async function releaseExpiredTables(): Promise<void> {
  const occupied = await TableModel.find({ isGuest: false, status: "occupied", occupiedAt: { $ne: null } }).select(
    "restaurantId occupiedAt autoReleaseMinutes"
  );
  if (occupied.length === 0) return;

  const restaurantIds = [...new Set(occupied.map((t) => t.restaurantId.toString()))];
  const restaurants = await Restaurant.find({ _id: { $in: restaurantIds } }).select("tableAutoReleaseMinutes");

  for (const restaurant of restaurants) {
    try {
      const now = Date.now();
      const expiredIds = occupied
        .filter((t) => t.restaurantId.toString() === restaurant._id.toString())
        .filter((t) => {
          const minutes = t.autoReleaseMinutes ?? restaurant.tableAutoReleaseMinutes;
          if (!minutes || minutes <= 0) return false;
          return t.occupiedAt!.getTime() <= now - minutes * 60 * 1000;
        })
        .map((t) => t._id);
      if (expiredIds.length === 0) continue;
      const cancelledOrders = await cancelUnsentOrdersForTables(expiredIds);
      for (const tableId of expiredIds) await syncTableState(tableId, { endSession: true });

      logger.info("table-release-scheduler: auto-released tables", {
        restaurantId: restaurant._id.toString(),
        count: expiredIds.length,
        cancelledOrders,
      });
    } catch (err) {
      logger.error("table-release-scheduler: release failed", {
        restaurantId: restaurant._id.toString(),
        ...describeError(err),
      });
    }
  }
}

export function initTableReleaseScheduler(): void {
  setInterval(() => {
    releaseExpiredTables().catch((err) => logger.error("table-release-scheduler: tick failed", describeError(err)));
    releaseServedPayFirstTables().catch((err) =>
      logger.error("table-release-scheduler: served tick failed", describeError(err))
    );
  }, CHECK_INTERVAL_MS);
}
