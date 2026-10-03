import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Area } from "../../lib/types";
import { posKeys } from "../pos/queries";
import { pricingApi } from "./api";

const NO_AREAS: Area[] = [];

export function useAreas() {
  const query = useQuery({ queryKey: ["pricing", "areas"], queryFn: pricingApi.areas, staleTime: 60_000 });
  return { ...query, areas: query.data ?? NO_AREAS };
}

export function useSaveAreas() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: pricingApi.saveAreas,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pricing"] });
      queryClient.invalidateQueries({ queryKey: posKeys.floor });
    },
  });
}

export function useSetTableArea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tableId, areaId }: { tableId: string; areaId: string | null }) =>
      pricingApi.setTableArea(tableId, areaId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: posKeys.floor }),
  });
}
