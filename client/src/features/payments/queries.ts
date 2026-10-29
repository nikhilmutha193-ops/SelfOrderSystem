import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { paymentsApi } from "./api";

export const paymentKeys = {
  settings: ["payments", "settings"] as const,
  attention: ["payments", "attention"] as const,
};

export function useGatewaySettings() {
  return useQuery({ queryKey: paymentKeys.settings, queryFn: paymentsApi.settings });
}

export function useSaveGatewaySettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: paymentsApi.saveSettings,
    onSuccess: (data) => queryClient.setQueryData(paymentKeys.settings, data),
  });
}

export function usePaymentsNeedingAttention(enabled = true) {
  return useQuery({ queryKey: paymentKeys.attention, queryFn: paymentsApi.attention, enabled });
}
