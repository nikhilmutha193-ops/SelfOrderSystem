import Restaurant from "../models/Restaurant";
import TableModel from "../models/Table";
import { describeError, logger } from "./logger";
import { cancelUnsentOrdersForTables } from "./tableRelease";

const CHECK_INTERVAL_MS = 60 * 1000;

/**
 * Releases tables that have sat occupied longer than their limit, so an abandoned
 * table doesn't stay blocked (and the guest's stale session token doesn't stay
 * usable) until staff notice. Orders that never reached the kitchen are cancelled
 * along with the seating.
 *
 * A table's own `autoReleaseMinutes` wins over the restaurant's default, which is
 * why every occupied table is examined rather than only those under a restaurant
 * with the feature switched on: an override can enable it for one table alone.
 * An effective value of 0 means "never expire".
 */
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
      await TableModel.updateMany(
        { _id: { $in: expiredIds } },
        // Clearing sessionId invalidates the guest's token immediately (same
        // check requireAuth already does for a manual release).
        { $set: { status: "available" }, $unset: { sessionId: "", occupiedAt: "" } }
      );
      const cancelledOrders = await cancelUnsentOrdersForTables(expiredIds);

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

/** Polls every minute for tables that have outstayed their restaurant's auto-release limit. */
export function initTableReleaseScheduler(): void {
  setInterval(() => {
    releaseExpiredTables().catch((err) => logger.error("table-release-scheduler: tick failed", describeError(err)));
  }, CHECK_INTERVAL_MS);
}
