import { useQuery } from "@tanstack/react-query";

import type { MenuCategory } from "../../lib/types";
import { api } from "../../shared/api/client";

export function useMenu() {
  return useQuery({
    queryKey: ["catalog", "menu"],
    queryFn: () => api.get<MenuCategory[]>("/menu").then((res) => res.data),
    staleTime: 60_000,
  });
}
