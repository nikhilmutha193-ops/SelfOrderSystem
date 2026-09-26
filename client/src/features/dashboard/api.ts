import type { DashboardSummary } from "../../lib/types";
import { api } from "../../shared/api/client";

export const dashboardApi = {
  summary: () => api.get<DashboardSummary>("/dashboard/summary").then((res) => res.data),
};
