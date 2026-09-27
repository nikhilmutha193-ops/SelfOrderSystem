import Restaurant from "../models/Restaurant";
import TableModel from "../models/Table";
import { describeError, logger } from "./logger";
import { cancelUnsentOrdersForTables } from "./tableRelease";
import { syncTableState } from "./tableState";

const CHECK_INTERVAL_MS = 60 * 1000;

async function releaseExpiredTables(): Promise<void> {
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
  }, CHECK_INTERVAL_MS);
}
