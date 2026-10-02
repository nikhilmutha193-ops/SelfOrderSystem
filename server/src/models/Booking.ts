import { model, Schema, Types } from "mongoose";

/**
 * pending   - taken over the phone/in person, waiting on staff to confirm and assign a table.
 * confirmed - a specific table is held for this exact slot; that table can't be self-served
 *             via QR/table-code login while a confirmed booking's slot is current (see
 *             bookings.service.ts's isTableReservedNow / auth.controller.ts's tableLogin).
 * seated    - the party has arrived and staff have let them start ordering; this ends the
 *             login block, even if the slot window hasn't technically finished yet.
 * cancelled / no_show - the slot is freed back up; no longer blocks the table.
 */
export type BookingStatus = "pending" | "confirmed" | "seated" | "cancelled" | "no_show";

export interface IBooking {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  customerName: string;
  /** Normalized via utils/phone.ts - mandatory so staff can always call to confirm/coordinate. */
  phone: string;
  partySize: number;
  /** "YYYY-MM-DD", the restaurant-local calendar date being booked. */
  bookingDate: string;
  slotStart: Date;
  slotEnd: Date;
  /** Assigned once a staff member confirms the booking; empty while pending. */
  tableId?: Types.ObjectId | null;
  status: BookingStatus;
  notes: string;
  createdByAdminId?: Types.ObjectId;
  createdByName?: string;
  confirmedAt?: Date | null;
  seatedAt?: Date | null;
  cancelledAt?: Date | null;
  cancelReason: string;
  createdAt: Date;
  updatedAt: Date;
}

const bookingSchema = new Schema<IBooking>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    customerName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    partySize: { type: Number, required: true, min: 1 },
    bookingDate: { type: String, required: true },
    slotStart: { type: Date, required: true },
    slotEnd: { type: Date, required: true },
    tableId: { type: Schema.Types.ObjectId, ref: "Table", default: null },
    status: {
      type: String,
      enum: ["pending", "confirmed", "seated", "cancelled", "no_show"],
      default: "pending",
      index: true,
    },
    notes: { type: String, default: "", trim: true },
    createdByAdminId: { type: Schema.Types.ObjectId, ref: "Admin" },
    createdByName: { type: String },
    confirmedAt: { type: Date, default: null },
    seatedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: "" },
  },
  { timestamps: true }
);

// The day view (admin booking list) and the availability calculation both filter by date.
bookingSchema.index({ restaurantId: 1, bookingDate: 1, slotStart: 1 });
// The table-login block check and the confirm-time conflict check both look up by table+time.
bookingSchema.index({ restaurantId: 1, tableId: 1, slotStart: 1 });

export default model<IBooking>("Booking", bookingSchema);
