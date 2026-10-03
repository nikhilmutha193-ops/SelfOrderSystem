import { useQuery } from "@tanstack/react-query";

import { analyticsApi } from "./api";

export function useMenuEngineering(days: number) {
  return useQuery({
    queryKey: ["analytics", "menu-engineering", days],
    queryFn: () => analyticsApi.menuEngineering(days),
  });
}
