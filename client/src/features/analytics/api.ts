import type { MenuEngineeringReport } from "../../lib/types";
import { api } from "../../shared/api/client";

export const analyticsApi = {
  menuEngineering: (days: number) =>
    api
      .get<MenuEngineeringReport>("/analytics/menu-engineering", {
        params: { days },
      })
      .then((r) => r.data),
};
