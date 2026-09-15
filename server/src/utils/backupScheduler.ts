import Restaurant from "../models/Restaurant";
import { isValidDayEndTime } from "./businessDay";
import { generateBackupFile } from "./backupService";

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
      console.log(`[backup-scheduler] generated scheduled backup for "${restaurant.key}"`);
    } catch (err) {
      console.error(`[backup-scheduler] failed to generate backup for "${restaurant.key}"`, err);
    }
  }
}

/** Polls every minute for restaurants whose daily backup schedule is due. */
export function initBackupScheduler(): void {
  setInterval(() => {
    runDueBackups().catch((err) => console.error("[backup-scheduler] tick failed", err));
  }, CHECK_INTERVAL_MS);
}
