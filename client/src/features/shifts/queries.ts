import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { shiftsApi, type ShiftRange } from "./api";

export const shiftKeys = {
  all: ["shifts"] as const,
  current: ["shifts", "current"] as const,
  history: (range: ShiftRange = {}) => ["shifts", "history", range] as const,
  today: ["shifts", "today"] as const,
  day: (date?: string) => ["shifts", "day", date ?? "today"] as const,
  dayHistory: ["shifts", "dayHistory"] as const,
};

export function useCurrentShift() {
  return useQuery({
    queryKey: shiftKeys.current,
    queryFn: shiftsApi.current,
    refetchInterval: 30000,
  });
}

export function useShiftHistory(range: ShiftRange = {}) {
  return useQuery({ queryKey: shiftKeys.history(range), queryFn: () => shiftsApi.history(range) });
}

/** Today's shifts, for the cashier. */
export function useTodayShifts(enabled = true) {
  return useQuery({ queryKey: shiftKeys.today, queryFn: shiftsApi.today, enabled, refetchInterval: 30000 });
}

export function useDayReport(date?: string) {
  return useQuery({
    queryKey: shiftKeys.day(date),
    queryFn: () => shiftsApi.dayPreview(date),
  });
}

export function useDayHistory() {
  return useQuery({
    queryKey: shiftKeys.dayHistory,
    queryFn: shiftsApi.dayHistory,
  });
}

function useShiftMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: shiftKeys.all }),
  });
}

export function useOpenShift() {
  return useShiftMutation((openingFloat: number) => shiftsApi.open(openingFloat));
}

export function useCashMovement() {
  return useShiftMutation(shiftsApi.cash);
}

export function useCloseShift() {
  return useShiftMutation(shiftsApi.close);
}

export function useCloseDay() {
  return useShiftMutation(shiftsApi.closeDay);
}
