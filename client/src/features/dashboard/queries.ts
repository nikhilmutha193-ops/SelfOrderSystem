import { useQuery } from "@tanstack/react-query";

import { dashboardApi } from "./api";

export const dashboardKeys = {
  summary: ["dashboard", "summary"] as const,
};

export function useDashboardSummary(options: { refetchInterval?: number; refetchIntervalInBackground?: boolean } = {}) {
  return useQuery({ queryKey: dashboardKeys.summary, queryFn: dashboardApi.summary, ...options });
}
