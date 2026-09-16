import Restaurant from "../models/Restaurant";
import TableModel from "../models/Table";
import { describeError, logger } from "./logger";

const CHECK_INTERVAL_MS = 60 * 1000;

/**
 * Releases tables that have sat occupied longer than the restaurant's
 * configured limit, so an abandoned table doesn't stay blocked (and the
 * guest's stale session token doesn't stay usable) until staff notice.
 * `tableAutoReleaseMinutes: 0` (the default) disables this entirely.
 */
async function releaseExpiredTables(): Promise<void> {
  const restaurants = await Restaurant.find({ tableAutoReleaseMinutes: { $gt: 0 } }).select(
    "tableAutoReleaseMinutes"
  );

  for (const restaurant of restaurants) {
    const cutoff = new Date(Date.now() - restaurant.tableAutoReleaseMinutes * 60 * 1000);
    try {
      const result = await TableModel.updateMany(
        {
          restaurantId: restaurant._id,
          isGuest: false,
          status: "occupied",
          occupiedAt: { $lte: cutoff },
        },
        // Clearing sessionId invalidates the guest's token immediately (same
        // check requireAuth already does for a manual release).
        { $set: { status: "available" }, $unset: { sessionId: "", occupiedAt: "" } }
      );
      if (result.modifiedCount > 0) {
        logger.info("table-release-scheduler: auto-released tables", {
          restaurantId: restaurant._id.toString(),
          count: result.modifiedCount,
        });
      }
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
