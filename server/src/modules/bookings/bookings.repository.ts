import { FilterQuery, Types } from "mongoose";

import Booking, { IBooking } from "../../models/Booking";
import Restaurant from "../../models/Restaurant";
import Table, { ITable } from "../../models/Table";

export class BookingsRepository {
  constructor(private readonly restaurantId: string) {}

  private scoped<T>(filter: FilterQuery<T> = {}): FilterQuery<T> {
    return { ...filter, restaurantId: this.restaurantId } as FilterQuery<T>;
  }

  findRestaurant() {
    // .lean() matters here: bookingSettings is a Mongoose subdocument whose schema-path values
    // are getters on its prototype, not own enumerable properties - settingsFor() spreads this
    // result, which silently drops every field unless it's a plain object.
    return Restaurant.findById(this.restaurantId).select("bookingSettings timezone name").lean();
  }

  updateBookingSettings(settings: object) {
    return Restaurant.findByIdAndUpdate(this.restaurantId, { $set: { bookingSettings: settings } }, { new: true }).select(
      "bookingSettings"
    );
  }

  /** Real, individually-seatable tables - guest/counter tables are shared walk-in tables and
   *  aren't reserved by a specific booking. */
  listBookableTables() {
    return Table.find(this.scoped<ITable>({ isGuest: { $ne: true } }))
      .select("code")
      .sort({ code: 1 })
      .lean();
  }

  countBookableTables() {
    return Table.countDocuments(this.scoped<ITable>({ isGuest: { $ne: true } }));
  }

  findTable(tableId: string) {
    return Table.findOne(this.scoped<ITable>({ _id: tableId }));
  }

  create(data: Partial<IBooking>) {
    return Booking.create({ ...data, restaurantId: this.restaurantId });
  }

  findById(id: string) {
    return Booking.findOne(this.scoped<IBooking>({ _id: id }));
  }

  listForDate(bookingDate: string) {
    return Booking.find(this.scoped<IBooking>({ bookingDate, status: { $ne: "cancelled" } }))
      .sort({ slotStart: 1 })
      .lean();
  }

  /** Active (pending/confirmed/seated) bookings overlapping a slot window, for capacity and
   *  conflict checks - a cancelled or no-show booking no longer holds its slot. */
  findActiveOverlapping(slotStart: Date, slotEnd: Date, excludeId?: string) {
    return Booking.find(
      this.scoped<IBooking>({
        status: { $in: ["pending", "confirmed", "seated"] },
        slotStart: { $lt: slotEnd },
        slotEnd: { $gt: slotStart },
        ...(excludeId && { _id: { $ne: new Types.ObjectId(excludeId) } }),
      })
    ).lean();
  }

  /** The confirmed booking (if any) currently holding this table, for the table-login block. */
  /** Bookable tables not already held by another active booking overlapping this slot - what
   *  the confirm dialog offers, so staff can't assign a booking onto a table that's already
   *  spoken for at that time. */
  async listTablesForSlot(slotStart: Date, slotEnd: Date, excludeBookingId?: string) {
    const [tables, overlapping] = await Promise.all([
      this.listBookableTables(),
      this.findActiveOverlapping(slotStart, slotEnd, excludeBookingId),
    ]);
    const taken = new Set(overlapping.filter((b) => b.tableId).map((b) => b.tableId!.toString()));
    return tables.map((t) => ({ tableId: t._id.toString(), code: t.code, available: !taken.has(t._id.toString()) }));
  }

  findConfirmedBookingForTableAt(tableId: Types.ObjectId, at: Date) {
    return Booking.findOne(
      this.scoped<IBooking>({ tableId, status: "confirmed", slotStart: { $lte: at }, slotEnd: { $gt: at } })
    ).lean();
  }
}
