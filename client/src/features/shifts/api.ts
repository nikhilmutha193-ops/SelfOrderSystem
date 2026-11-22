import type { DayCloseRecord, DayReport, Shift } from "../../lib/types";
import { api } from "../../shared/api/client";

export interface ShiftRange {
  from?: string;
  to?: string;
  limit?: number;
}

export const shiftsApi = {
  current: () => api.get<{ shift: Shift | null }>("/shifts/current").then((res) => res.data.shift),
  /** The admin history: newest first, optionally between two business dates (YYYY-MM-DD). */
  history: (range: ShiftRange = {}) =>
    api.get<Shift[]>("/shifts", { params: { limit: 100, ...range } }).then((res) => res.data),
  /** The cashier's view: the shifts of today's business day only. */
  today: () => api.get<Shift[]>("/shifts", { params: { scope: "day" } }).then((res) => res.data),
  open: (openingFloat: number) => api.post<Shift>("/shifts/open", { openingFloat }).then((res) => res.data),
  cash: (input: { type: "in" | "out"; amount: number; reason: string }) =>
    api.post<Shift>("/shifts/current/cash", input).then((res) => res.data),
  close: (input: { countedCash: number; note?: string }) =>
    api.post<Shift>("/shifts/current/close", input).then((res) => res.data),
  dayPreview: (date?: string) =>
    api
      .get<DayReport>("/day-close/preview", {
        params: date ? { date } : undefined,
      })
      .then((res) => res.data),
  closeDay: (input: { date?: string; carryForward?: boolean }) =>
    api.post<DayReport>("/day-close", input).then((res) => res.data),
  dayHistory: () => api.get<DayCloseRecord[]>("/day-close").then((res) => res.data),
};
