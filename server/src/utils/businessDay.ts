interface ZonedParts {
  year: number;
  month: number;
  day: number;
  minutesIntoDay: number;
}

const DAY_END_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const DEFAULT_TIMEZONE = "Asia/Kolkata";

export function isValidDayEndTime(value: string): boolean {
  return DAY_END_PATTERN.test(value);
}

export function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function resolveZone(timeZone: string | undefined): string {
  return timeZone && isValidTimezone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
}

function parseCutoffMinutes(dayEndTime: string | undefined): number {
  if (!dayEndTime || !isValidDayEndTime(dayEndTime)) return 0;
  const [hours, minutes] = dayEndTime.split(":").map(Number);
  return hours * 60 + minutes;
}

function zonedParts(at: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  // "24" shows up at midnight in some ICU builds, so fold it back to 0.
  const hour = get("hour") % 24;
  return { year: get("year"), month: get("month"), day: get("day"), minutesIntoDay: hour * 60 + get("minute") };
}

function zoneOffsetMinutes(at: Date, timeZone: string): number {
  const { year, month, day, minutesIntoDay } = zonedParts(at, timeZone);
  const wall = Date.UTC(year, month - 1, day, 0, minutesIntoDay);
  return (wall - Math.floor(at.getTime() / 60000) * 60000) / 60000;
}

function wallTimeToUtc(year: number, month: number, day: number, minutesIntoDay: number, timeZone: string): Date {
  const asIfUtc = Date.UTC(year, month - 1, day, 0, minutesIntoDay);
  const candidate = new Date(asIfUtc - zoneOffsetMinutes(new Date(asIfUtc), timeZone) * 60000);
  return new Date(asIfUtc - zoneOffsetMinutes(candidate, timeZone) * 60000);
}

function shiftDay({ year, month, day }: Omit<ZonedParts, "minutesIntoDay">, days: number) {
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function getBusinessDayStart(now: Date, dayEndTime: string | undefined, timeZone?: string): Date {
  const zone = resolveZone(timeZone);
  const cutoffMinutes = parseCutoffMinutes(dayEndTime);
  const { year, month, day, minutesIntoDay } = zonedParts(now, zone);

  const target = minutesIntoDay < cutoffMinutes ? shiftDay({ year, month, day }, -1) : { year, month, day };
  return wallTimeToUtc(target.year, target.month, target.day, cutoffMinutes, zone);
}

export function getBusinessDayRangeForDate(
  dateStr: string,
  dayEndTime: string | undefined,
  timeZone?: string
): { start: Date; end: Date } {
  const zone = resolveZone(timeZone);
  const cutoffMinutes = parseCutoffMinutes(dayEndTime);
  const [year, month, day] = dateStr.split("-").map(Number);

  const next = shiftDay({ year, month, day }, 1);
  return {
    start: wallTimeToUtc(year, month, day, cutoffMinutes, zone),
    end: wallTimeToUtc(next.year, next.month, next.day, cutoffMinutes, zone),
  };
}
