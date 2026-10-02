import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { bookingsApi } from "./api";

export const bookingKeys = {
  all: ["bookings"] as const,
  settings: ["bookings", "settings"] as const,
  availability: (date: string) => ["bookings", "availability", date] as const,
  list: (date?: string) => ["bookings", "list", date ?? "today"] as const,
};

export function useBookingSettings() {
  return useQuery({ queryKey: bookingKeys.settings, queryFn: bookingsApi.settings });
}

export function useSaveBookingSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: bookingsApi.saveSettings,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bookingKeys.all }),
  });
}

export function useBookingAvailability(date: string) {
  return useQuery({ queryKey: bookingKeys.availability(date), queryFn: () => bookingsApi.availability(date) });
}

export function useBookings(date?: string) {
  return useQuery({ queryKey: bookingKeys.list(date), queryFn: () => bookingsApi.list(date) });
}

export function useTablesForBooking(id: string | null) {
  return useQuery({
    queryKey: ["bookings", "tables", id],
    queryFn: () => bookingsApi.tablesForBooking(id!),
    enabled: !!id,
  });
}

function useBookingMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn, onSuccess: () => queryClient.invalidateQueries({ queryKey: bookingKeys.all }) });
}

export function useCreateBooking() {
  return useBookingMutation(bookingsApi.create);
}

export function useConfirmBooking() {
  return useBookingMutation(bookingsApi.confirm);
}

export function useCancelBooking() {
  return useBookingMutation(bookingsApi.cancel);
}

export function useSeatBooking() {
  return useBookingMutation(bookingsApi.seat);
}

export function useNoShowBooking() {
  return useBookingMutation(bookingsApi.noShow);
}
