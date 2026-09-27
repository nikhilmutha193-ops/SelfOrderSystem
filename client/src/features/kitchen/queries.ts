import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { POLL } from "../../shared/api/queryClient";
import { refreshOrderData } from "../orders/queries";
import { kitchenApi } from "./api";

export const kitchenKeys = {
  queue: (tableId?: string, stationId?: string) => ["kitchen", "queue", tableId ?? "all", stationId ?? "all"] as const,
};

export function useKotQueue(tableId?: string, stationId?: string, enabled = true) {
  return useQuery({
    enabled,
    queryKey: kitchenKeys.queue(tableId, stationId),
    queryFn: () => kitchenApi.queue(tableId, stationId),
    refetchInterval: POLL.kitchenQueue,
    refetchIntervalInBackground: true,
  });
}

function useKitchenMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn, onSuccess: () => refreshOrderData(queryClient) });
}

export function usePrintKot() {
  return useKitchenMutation((orderId: string) => kitchenApi.printKot(orderId));
}

export function useStartPreparing() {
  return useKitchenMutation((itemId: string) => kitchenApi.startPreparing(itemId));
}

export function useMarkReady() {
  return useKitchenMutation((itemId: string) => kitchenApi.markReady(itemId));
}

export function useServeItem() {
  return useKitchenMutation((itemId: string) => kitchenApi.serve(itemId));
}
