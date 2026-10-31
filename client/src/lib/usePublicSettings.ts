import { useQuery } from "@tanstack/react-query";

import { api } from "../shared/api/client";
import type { ServiceFlow, TableLoginSettings } from "./types";

export interface PublicSettings {
  name?: string;
  logoUrl?: string;
  serviceFlow?: ServiceFlow;
  tableLoginSettings?: TableLoginSettings;
}

/** The restaurant settings anyone may read (no sign-in): its flow and how guests may sign in to a table. */
export function usePublicSettings(): PublicSettings | undefined {
  return useQuery({
    queryKey: ["restaurant", "public"],
    queryFn: () => api.get<PublicSettings>("/restaurant/public").then((res) => res.data),
    staleTime: 60_000,
  }).data;
}
