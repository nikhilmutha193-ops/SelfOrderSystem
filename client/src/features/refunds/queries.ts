import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { refreshOrderData } from "../orders/queries";
import { refundsApi, type NewRefund } from "./api";

export const refundKeys = {
  all: ["refunds"] as const,
  summary: (orderId: string) => ["refunds", "order", orderId] as const,
  list: (from?: string, to?: string) => ["refunds", "list", from ?? "", to ?? ""] as const,
};

export function useRefundSummary(orderId: string, enabled: boolean) {
  return useQuery({
    queryKey: refundKeys.summary(orderId),
    queryFn: () => refundsApi.summary(orderId),
    enabled,
  });
}

export function useRefundList(from?: string, to?: string) {
  return useQuery({ queryKey: refundKeys.list(from, to), queryFn: () => refundsApi.list(from, to) });
}

export function useCreateRefund() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewRefund) => refundsApi.create(input),
    onSuccess: async () => {
      await Promise.all([
        refreshOrderData(queryClient),
        queryClient.invalidateQueries({ queryKey: refundKeys.all }),
        queryClient.invalidateQueries({ queryKey: ["shifts"] }),
      ]);
    },
  });
}
