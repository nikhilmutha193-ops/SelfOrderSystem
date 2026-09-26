import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { POLL } from "../../shared/api/queryClient";
import { refreshOrderData } from "../orders/queries";
import { kitchenApi } from "./api";

export const kitchenKeys = {
  queue: (tableId?: string) => ["kitchen", "queue", tableId ?? "all"] as const,
};

export function useKotQueue(tableId?: string) {
  return useQuery({
    queryKey: kitchenKeys.queue(tableId),
    queryFn: () => kitchenApi.queue(tableId),
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
