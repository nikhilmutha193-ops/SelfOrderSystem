/**
 * Restaurants open past midnight (e.g. until 2am) still think of those late orders
 * as belonging to the previous calendar day's business, not the next one. This
 * lets "today" in dashboards/reports/billing be bounded by a configurable day-end
 * time instead of always splitting at midnight.
 */

const DAY_END_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidDayEndTime(value: string): boolean {
  return DAY_END_PATTERN.test(value);
}

function parseCutoffMinutes(dayEndTime: string | undefined): number {
  if (!dayEndTime || !isValidDayEndTime(dayEndTime)) return 0;
  const [hours, minutes] = dayEndTime.split(":").map(Number);
  return hours * 60 + minutes;
}

/** Start of the current business day (the most recent day-end cutoff at or before `now`). */
export function getBusinessDayStart(now: Date, dayEndTime: string | undefined): Date {
  const cutoffMinutes = parseCutoffMinutes(dayEndTime);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (nowMinutes < cutoffMinutes) {
    start.setDate(start.getDate() - 1);
  }
  start.setHours(Math.floor(cutoffMinutes / 60), cutoffMinutes % 60, 0, 0);
  return start;
}

/** [start, end) range for the current business day. */
export function getBusinessDayRange(now: Date, dayEndTime: string | undefined): { start: Date; end: Date } {
  const start = getBusinessDayStart(now, dayEndTime);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/**
 * [start, end) range for the business day LABELED with this calendar date - e.g. picking
 * "Sep 13" with a 03:00 cutoff means the window Sep 13 03:00 -> Sep 14 03:00, including the
 * early hours of Sep 14 that are still "Sep 13's business" (not the day that Sep-13-midnight
 * itself falls in, which getBusinessDayStart would instead roll back to Sep 12).
 */
export function getBusinessDayRangeForDate(dateStr: string, dayEndTime: string | undefined): { start: Date; end: Date } {
  const cutoffMinutes = parseCutoffMinutes(dayEndTime);
  const start = new Date(`${dateStr}T00:00:00`);
  start.setHours(Math.floor(cutoffMinutes / 60), cutoffMinutes % 60, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}
