import { z } from "zod";

import { blankToUndefined, objectId } from "../../core/validate";

const bookingDate = z
  .string({ error: "Choose a date" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Dates must be in YYYY-MM-DD format" });

const slotTime = z
  .string({ error: "Choose a time slot" })
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, { error: "Times must be in HH:mm format" });

export const bookingSettingsSchema = z
  .object({
    enabled: z.boolean(),
    openTime: slotTime,
    closeTime: slotTime,
    slotMinutes: z
      .number()
      .int()
      .min(5, { error: "Slots must be at least 5 minutes" })
      .max(240, { error: "Keep slots at 240 minutes or less" }),
  })
  .refine((v) => v.openTime < v.closeTime, { error: "Opening time must be before closing time", path: ["closeTime"] });

export const availabilityQuery = z.object({ date: bookingDate });

export const createBookingSchema = z.object({
  customerName: z
    .string({ error: "Enter the guest's name" })
    .trim()
    .min(1, { error: "Enter the guest's name" })
    .max(80, { error: "Keep the name under 80 characters" }),
  // A contact number is mandatory - staff need it to confirm/coordinate the booking.
  phone: z
    .string({ error: "A contact number is required" })
    .trim()
    .min(8, { error: "Enter a valid contact number" })
    .max(15, { error: "Enter a valid contact number" }),
  partySize: z
    .number({ error: "Enter the number of guests" })
    .int()
    .min(1, { error: "Party size must be at least 1" })
    .max(100, { error: "Keep party size at 100 or less" }),
  bookingDate,
  slotStart: slotTime,
  notes: blankToUndefined(z.string().trim().max(300, { error: "Keep notes under 300 characters" })),
});

export const listBookingsQuery = z.object({ date: blankToUndefined(bookingDate) });

export const confirmBookingSchema = z.object({ tableId: objectId("Choose a table") });

export const cancelBookingSchema = z.object({
  reason: blankToUndefined(z.string().trim().max(200, { error: "Keep the reason under 200 characters" })),
});

export const bookingParams = z.object({ id: objectId() });

export type BookingSettingsInput = z.output<typeof bookingSettingsSchema>;
export type CreateBookingInput = z.output<typeof createBookingSchema>;
export type ConfirmBookingInput = z.output<typeof confirmBookingSchema>;
export type CancelBookingInput = z.output<typeof cancelBookingSchema>;
