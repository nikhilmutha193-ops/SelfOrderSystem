import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { POLL } from "../../shared/api/queryClient";
import { refreshOrderData } from "../orders/queries";
import { posApi } from "./api";

export const posKeys = {
  menu: ["pos", "menu"] as const,
  floor: ["orders", "pos-floor"] as const,
};

export function usePosMenu() {
  return useQuery({ queryKey: posKeys.menu, queryFn: posApi.menu, staleTime: 5 * 60_000 });
}

export function usePosFloor() {
  return useQuery({ queryKey: posKeys.floor, queryFn: posApi.floor, refetchInterval: POLL.posFloor });
}

export function useCreatePosOrder() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: posApi.createOrder, onSuccess: () => refreshOrderData(queryClient) });
}
