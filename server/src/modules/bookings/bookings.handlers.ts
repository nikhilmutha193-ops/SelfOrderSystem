import { on } from "../../core/events";
import { resolveZone } from "../../utils/businessDay";
import { sendSms } from "../../utils/sms";
import { BookingsRepository } from "./bookings.repository";

function formatSlotTime(date: Date, timeZone: string): string {
  return date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone });
}

/**
 * Texts the guest when their booking is confirmed or falls through (cancelled/no-show) - the two
 * moments they'd actually want to know about. Nothing sends on the initial request, since that's
 * still pending and staff might change the time/table before confirming.
 */
export function registerBookingHandlers() {
  on("booking.confirmed", async ({ restaurantId, bookingId }) => {
    const repo = new BookingsRepository(restaurantId);
    const [booking, restaurant] = await Promise.all([repo.findById(bookingId), repo.findRestaurant()]);
    if (!booking) return;
    const time = formatSlotTime(booking.slotStart, resolveZone(restaurant?.timezone));
    await sendSms(
      booking.phone,
      `Hi ${booking.customerName}, your table at ${restaurant?.name ?? "our restaurant"} is confirmed for ${booking.bookingDate} at ${time}. See you soon!`
    );
  });

  on("booking.cancelled", async ({ restaurantId, bookingId, status }) => {
    const repo = new BookingsRepository(restaurantId);
    const [booking, restaurant] = await Promise.all([repo.findById(bookingId), repo.findRestaurant()]);
    if (!booking) return;
    const what = status === "no_show" ? "was marked as a no-show" : "has been cancelled";
    await sendSms(
      booking.phone,
      `Hi ${booking.customerName}, your booking at ${restaurant?.name ?? "our restaurant"} for ${booking.bookingDate} ${what}. Contact us if this doesn't seem right.`
    );
  });
}
