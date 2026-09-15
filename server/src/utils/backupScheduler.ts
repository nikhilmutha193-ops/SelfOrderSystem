import Restaurant from "../models/Restaurant";
import { isValidDayEndTime } from "./businessDay";
import { generateBackupFile } from "./backupService";
import { describeError, logger } from "./logger";

const CHECK_INTERVAL_MS = 60 * 1000;

function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function currentHHmm(now: Date): string {
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

async function runDueBackups(): Promise<void> {
  const now = new Date();
  const nowLabel = currentHHmm(now);

  const restaurants = await Restaurant.find({ "backupSchedule.enabled": true });
  for (const restaurant of restaurants) {
    const schedule = restaurant.backupSchedule;
    if (!schedule?.enabled || !isValidDayEndTime(schedule.time)) continue;
    if (schedule.time !== nowLabel) continue;
    if (schedule.lastRunAt && isSameCalendarDay(schedule.lastRunAt, now)) continue;

    try {
      await generateBackupFile(restaurant._id, "scheduled");
      restaurant.backupSchedule.lastRunAt = now;
      await restaurant.save();
      logger.info("backup-scheduler: generated scheduled backup", { restaurantKey: restaurant.key });
    } catch (err) {
      logger.error("backup-scheduler: backup failed", { restaurantKey: restaurant.key, ...describeError(err) });
    }
  }
}

/** Polls every minute for restaurants whose daily backup schedule is due. */
export function initBackupScheduler(): void {
  setInterval(() => {
    runDueBackups().catch((err) => logger.error("backup-scheduler: tick failed", describeError(err)));
  }, CHECK_INTERVAL_MS);
}
