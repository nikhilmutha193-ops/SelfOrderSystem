import type { Booking, BookingAvailabilitySlot, BookingSettings, BookingsForDate } from "../../lib/types";
import { api } from "../../shared/api/client";

export interface CreateBookingInput {
  customerName: string;
  phone: string;
  partySize: number;
  bookingDate: string;
  slotStart: string;
  notes?: string;
}

export const bookingsApi = {
  settings: () => api.get<BookingSettings>("/bookings/settings").then((res) => res.data),
  saveSettings: (input: BookingSettings) => api.put<BookingSettings>("/bookings/settings", input).then((res) => res.data),
  availability: (date: string) =>
    api.get<BookingAvailabilitySlot[]>("/bookings/availability", { params: { date } }).then((res) => res.data),
  list: (date?: string) => api.get<BookingsForDate>("/bookings", { params: date ? { date } : undefined }).then((res) => res.data),
  create: (input: CreateBookingInput) => api.post<Booking>("/bookings", input).then((res) => res.data),
  tablesForBooking: (id: string) =>
    api.get<{ tableId: string; code: string; available: boolean }[]>(`/bookings/${id}/tables`).then((res) => res.data),
  confirm: ({ id, tableId }: { id: string; tableId: string }) =>
    api.post<Booking>(`/bookings/${id}/confirm`, { tableId }).then((res) => res.data),
  cancel: ({ id, reason }: { id: string; reason?: string }) =>
    api.post<Booking>(`/bookings/${id}/cancel`, { reason }).then((res) => res.data),
  seat: (id: string) => api.post<Booking>(`/bookings/${id}/seat`).then((res) => res.data),
  noShow: (id: string) => api.post<Booking>(`/bookings/${id}/no-show`).then((res) => res.data),
};
