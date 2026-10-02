const IST = "Asia/Kolkata";

/** "YYYY-MM-DD" for "today" in IST, regardless of the viewer's own device timezone - matches the
 *  server's calendarDateLabel() in bookings.service.ts, which is what actually decides which
 *  slots are still bookable. */
export function todayIst(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date()
  );
}

export function formatIstTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: IST });
}
