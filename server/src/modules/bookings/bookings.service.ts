import { Types } from "mongoose";

import { RequestContext } from "../../core/context";
import { emit } from "../../core/events";
import { IBookingSettings } from "../../models/Restaurant";
import { resolveZone, wallTimeToUtc } from "../../utils/businessDay";
import { HttpError } from "../../utils/httpError";
import { displayPhone, normalizePhone } from "../../utils/phone";
import { writeAudit } from "../../utils/audit";
import { BookingsRepository } from "./bookings.repository";
import { BookingSettingsInput, CreateBookingInput } from "./bookings.schema";

const DEFAULT_SETTINGS: IBookingSettings = { enabled: false, openTime: "11:00", closeTime: "22:00", slotMinutes: 30 };

function parseHHmm(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

function formatHHmm(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

/** "YYYY-MM-DD" for "now" in the given timezone - the guest's actual calendar date, not the
 *  restaurant's business-day rollover (a booking for "7pm today" means the same thing to a
 *  guest regardless of how late the restaurant's orders roll over into the next business day). */
function calendarDateLabel(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Minutes since local midnight, right now, in the given timezone. */
function nowMinutesIntoDay(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour12: false, hour: "2-digit", minute: "2-digit" })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return (Number(parts.hour) % 24) * 60 + Number(parts.minute);
}

async function settingsFor(repo: BookingsRepository) {
  const restaurant = await repo.findRestaurant();
  const settings: IBookingSettings = { ...DEFAULT_SETTINGS, ...(restaurant?.bookingSettings ?? {}) };
  const timezone = resolveZone(restaurant?.timezone);
  return { settings, timezone };
}

function slotStartsForDay(settings: IBookingSettings): number[] {
  const starts: number[] = [];
  const open = parseHHmm(settings.openTime);
  const close = parseHHmm(settings.closeTime);
  for (let start = open; start + settings.slotMinutes <= close; start += settings.slotMinutes) {
    starts.push(start);
  }
  return starts;
}

export async function getSettings(restaurantId: string) {
  const { settings } = await settingsFor(new BookingsRepository(restaurantId));
  return settings;
}

export async function saveSettings(ctx: RequestContext, input: BookingSettingsInput) {
  const repo = new BookingsRepository(ctx.restaurantId);
  const restaurant = await repo.updateBookingSettings(input);
  await writeAudit(ctx, "bookings.settings.save", `Updated table booking settings`);
  return restaurant?.bookingSettings ?? input;
}

export interface AvailabilitySlot {
  slotStart: string; // "HH:mm"
  slotEnd: string;
  available: boolean;
  remaining: number;
}

export async function getAvailability(restaurantId: string, date: string): Promise<AvailabilitySlot[]> {
  const repo = new BookingsRepository(restaurantId);
  const { settings, timezone } = await settingsFor(repo);
  if (!settings.enabled) return [];

  const totalTables = await repo.countBookableTables();
  const today = calendarDateLabel(new Date(), timezone);
  const currentMinutes = date === today ? nowMinutesIntoDay(new Date(), timezone) : -1;

  const [year, month, day] = date.split("-").map(Number);
  const slots: AvailabilitySlot[] = [];
  for (const startMinutes of slotStartsForDay(settings)) {
    if (startMinutes <= currentMinutes) continue; // that slot has already begun/passed today

    const slotStart = wallTimeToUtc(year, month, day, startMinutes, timezone);
    const slotEnd = wallTimeToUtc(year, month, day, startMinutes + settings.slotMinutes, timezone);
    const overlapping = await repo.findActiveOverlapping(slotStart, slotEnd);
    const remaining = totalTables - overlapping.length;
    slots.push({
      slotStart: formatHHmm(startMinutes),
      slotEnd: formatHHmm(startMinutes + settings.slotMinutes),
      available: remaining > 0,
      remaining: Math.max(0, remaining),
    });
  }
  return slots;
}

function actorName(ctx: RequestContext) {
  return ctx.admin?.username;
}

async function buildBooking(
  restaurantId: string,
  input: CreateBookingInput,
  actor: { createdByAdminId?: Types.ObjectId; createdByName?: string }
) {
  const repo = new BookingsRepository(restaurantId);
  const { settings, timezone } = await settingsFor(repo);
  if (!settings.enabled) throw new HttpError(409, "Table booking isn't enabled for this restaurant");

  const phone = normalizePhone(input.phone);
  if (!phone) throw new HttpError(400, "Enter a valid contact number");

  const startMinutes = parseHHmm(input.slotStart);
  const validStarts = slotStartsForDay(settings);
  if (!validStarts.includes(startMinutes)) throw new HttpError(400, "That isn't a valid time slot");

  const today = calendarDateLabel(new Date(), timezone);
  if (input.bookingDate < today) throw new HttpError(400, "Choose a date that hasn't passed yet");
  if (input.bookingDate === today && startMinutes <= nowMinutesIntoDay(new Date(), timezone)) {
    throw new HttpError(409, "That time slot has already started - choose a later one");
  }

  const [year, month, day] = input.bookingDate.split("-").map(Number);
  const slotStart = wallTimeToUtc(year, month, day, startMinutes, timezone);
  const slotEnd = wallTimeToUtc(year, month, day, startMinutes + settings.slotMinutes, timezone);

  const [totalTables, overlapping] = await Promise.all([
    repo.countBookableTables(),
    repo.findActiveOverlapping(slotStart, slotEnd),
  ]);
  if (overlapping.length >= totalTables) {
    throw new HttpError(409, "No tables are available for that time slot");
  }

  return repo.create({
    customerName: input.customerName,
    phone,
    partySize: input.partySize,
    bookingDate: input.bookingDate,
    slotStart,
    slotEnd,
    status: "pending",
    notes: input.notes ?? "",
    ...actor,
  });
}

export async function createBooking(ctx: RequestContext, input: CreateBookingInput) {
  const booking = await buildBooking(ctx.restaurantId, input, {
    createdByAdminId: ctx.auth.id ? new Types.ObjectId(ctx.auth.id) : undefined,
    createdByName: actorName(ctx),
  });

  await writeAudit(
    ctx,
    "bookings.create",
    `Booked a table for ${input.customerName} (${input.partySize} guests) on ${input.bookingDate} at ${input.slotStart}`
  );
  return booking;
}

/**
 * Called from the public table sign-in page - a guest choosing "Reserve a table" has no admin
 * session, so this skips actor stamping and audit (that's for staff actions) and always lands
 * the booking as "pending" for staff to confirm.
 */
export async function createPublicBooking(restaurantId: string, input: CreateBookingInput) {
  return buildBooking(restaurantId, input, { createdByName: "Guest (table sign-in)" });
}

export async function listBookings(ctx: RequestContext, date: string | undefined) {
  const repo = new BookingsRepository(ctx.restaurantId);
  const { timezone } = await settingsFor(repo);
  const targetDate = date ?? calendarDateLabel(new Date(), timezone);
  const [bookings, tables] = await Promise.all([repo.listForDate(targetDate), repo.listBookableTables()]);
  const tableCode = new Map(tables.map((t) => [t._id.toString(), t.code]));
  return {
    date: targetDate,
    bookings: bookings.map((b) => ({
      ...b,
      phoneDisplay: displayPhone(b.phone),
      tableCode: b.tableId ? (tableCode.get(b.tableId.toString()) ?? null) : null,
    })),
  };
}

export async function listTablesForBooking(ctx: RequestContext, id: string) {
  const repo = new BookingsRepository(ctx.restaurantId);
  const booking = await repo.findById(id);
  if (!booking) throw new HttpError(404, "Booking not found");
  return repo.listTablesForSlot(booking.slotStart, booking.slotEnd, booking._id.toString());
}

export async function confirmBooking(ctx: RequestContext, id: string, tableId: string) {
  const repo = new BookingsRepository(ctx.restaurantId);
  const booking = await repo.findById(id);
  if (!booking) throw new HttpError(404, "Booking not found");
  if (booking.status !== "pending" && booking.status !== "confirmed") {
    throw new HttpError(409, `This booking is ${booking.status.replace("_", " ")} and can't be confirmed`);
  }

  const table = await repo.findTable(tableId);
  if (!table) throw new HttpError(404, "Table not found");
  if (table.isGuest) throw new HttpError(400, "Guest/walk-in tables can't be reserved for a booking");

  const overlapping = await repo.findActiveOverlapping(booking.slotStart, booking.slotEnd, booking._id.toString());
  if (overlapping.some((b) => b.tableId?.toString() === tableId)) {
    throw new HttpError(409, `${table.code} already has another booking in this time slot`);
  }

  booking.tableId = table._id;
  booking.status = "confirmed";
  booking.confirmedAt = new Date();
  await booking.save();
  await writeAudit(ctx, "bookings.confirm", `Confirmed ${booking.customerName}'s booking on table ${table.code}`);
  await emit("booking.confirmed", { restaurantId: ctx.restaurantId, bookingId: booking._id.toString() });
  return booking;
}

export async function cancelBooking(ctx: RequestContext, id: string, reason: string | undefined) {
  const repo = new BookingsRepository(ctx.restaurantId);
  const booking = await repo.findById(id);
  if (!booking) throw new HttpError(404, "Booking not found");
  if (booking.status === "cancelled" || booking.status === "no_show") {
    throw new HttpError(409, "This booking is already closed out");
  }

  booking.status = "cancelled";
  booking.cancelledAt = new Date();
  booking.cancelReason = reason ?? "";
  await booking.save();
  await writeAudit(ctx, "bookings.cancel", `Cancelled ${booking.customerName}'s booking${reason ? `: ${reason}` : ""}`);
  await emit("booking.cancelled", { restaurantId: ctx.restaurantId, bookingId: booking._id.toString(), status: "cancelled" });
  return booking;
}

export async function markSeated(ctx: RequestContext, id: string) {
  const repo = new BookingsRepository(ctx.restaurantId);
  const booking = await repo.findById(id);
  if (!booking) throw new HttpError(404, "Booking not found");
  if (booking.status !== "confirmed") throw new HttpError(409, "Only a confirmed booking can be marked as seated");

  booking.status = "seated";
  booking.seatedAt = new Date();
  await booking.save();
  await writeAudit(ctx, "bookings.seat", `Seated ${booking.customerName}'s party - table is free to self-order now`);
  return booking;
}

export async function markNoShow(ctx: RequestContext, id: string) {
  const repo = new BookingsRepository(ctx.restaurantId);
  const booking = await repo.findById(id);
  if (!booking) throw new HttpError(404, "Booking not found");
  if (booking.status !== "confirmed" && booking.status !== "pending") {
    throw new HttpError(409, "This booking is already closed out");
  }

  booking.status = "no_show";
  await booking.save();
  await writeAudit(ctx, "bookings.noShow", `Marked ${booking.customerName}'s booking as a no-show`);
  await emit("booking.cancelled", { restaurantId: ctx.restaurantId, bookingId: booking._id.toString(), status: "no_show" });
  return booking;
}

/**
 * Called from the (not-yet-migrated) table auth controller, outside any admin RequestContext -
 * a guest scanning a QR code has no admin session, so this takes the restaurant/table ids
 * directly rather than a ctx. Returns the confirmed booking currently holding this table, if
 * any, so a walk-in can't grab a table that's reserved for an imminent/current booking.
 */
export async function findActiveReservationForTable(restaurantId: string, tableId: string, at: Date = new Date()) {
  const repo = new BookingsRepository(restaurantId);
  return repo.findConfirmedBookingForTableAt(new Types.ObjectId(tableId), at);
}
