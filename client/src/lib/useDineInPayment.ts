import { useQuery } from "@tanstack/react-query";

import { api } from "../shared/api/client";
import type { DineInPayment } from "./types";

interface PublicRestaurant {
  billingSettings?: { dineInPayment?: DineInPayment };
}

/** Shares the ["restaurant", "public"] query with the admin shell's branding, so it costs no extra request. */
export const PUBLIC_RESTAURANT_KEY = ["restaurant", "public"] as const;

/** When dine-in guests pay ("after" until the restaurant has loaded). */
export function useDineInPayment(): DineInPayment {
  const { data } = useQuery({
    queryKey: PUBLIC_RESTAURANT_KEY,
    queryFn: () => api.get<PublicRestaurant>("/restaurant/public").then((r) => r.data),
    staleTime: 10 * 60 * 1000,
  });
  return data?.billingSettings?.dineInPayment === "upfront" ? "upfront" : "after";
}
