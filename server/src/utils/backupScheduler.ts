import Restaurant from "../models/Restaurant";
import { generateBackupFile } from "./backupService";
import { isValidDayEndTime } from "./businessDay";
import { describeError, logger } from "./logger";

const CHECK_INTERVAL_MS = 60 * 1000;

function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Backups run at each of these times a day (old settings only have the single `time`). */
export function backupTimes(schedule: { time?: string; times?: string[] } | undefined): string[] {
  const list = schedule?.times?.length ? schedule.times : schedule?.time ? [schedule.time] : [];
  return [...new Set(list.filter(isValidDayEndTime))].sort();
}

function currentHHmm(now: Date): string {
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

export async function runDueBackups(now: Date = new Date()): Promise<void> {
  const nowLabel = currentHHmm(now);

  const restaurants = await Restaurant.find({ "backupSchedule.enabled": true });
  for (const restaurant of restaurants) {
    const schedule = restaurant.backupSchedule;
    if (!schedule?.enabled || !backupTimes(schedule).includes(nowLabel)) continue;
    // One backup per scheduled minute: a second tick in the same minute must not make another.
    if (schedule.lastRunAt && isSameCalendarDay(schedule.lastRunAt, now) && currentHHmm(schedule.lastRunAt) === nowLabel) continue;

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

export function initBackupScheduler(): void {
  setInterval(() => {
    runDueBackups().catch((err) => logger.error("backup-scheduler: tick failed", describeError(err)));
  }, CHECK_INTERVAL_MS);
}
