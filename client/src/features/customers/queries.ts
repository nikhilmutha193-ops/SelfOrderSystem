import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { refreshOrderData } from "../orders/queries";
import { customersApi, type Segment } from "./api";

export const customerKeys = {
  all: ["customers"] as const,
  list: (segment?: Segment, q?: string) => ["customers", "list", segment ?? "all", q ?? ""] as const,
  profile: (id: string) => ["customers", "profile", id] as const,
  order: (orderId: string) => ["orders", "customer", orderId] as const,
  settings: ["customers", "settings"] as const,
};

export const useCustomers = (segment?: Segment, q?: string) =>
  useQuery({ queryKey: customerKeys.list(segment, q), queryFn: () => customersApi.list({ segment, q }) });

export const useCustomerProfile = (id: string | null) =>
  useQuery({ queryKey: customerKeys.profile(id ?? ""), queryFn: () => customersApi.profile(id!), enabled: !!id });

export const useOrderCustomer = (orderId: string | null | undefined) =>
  useQuery({
    queryKey: customerKeys.order(orderId ?? ""),
    queryFn: () => customersApi.orderCustomer(orderId!),
    enabled: !!orderId,
  });

export const useLoyaltySettings = () => useQuery({ queryKey: customerKeys.settings, queryFn: customersApi.settings });

function useCustomerMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all([queryClient.invalidateQueries({ queryKey: customerKeys.all }), refreshOrderData(queryClient)]),
  });
}

export const useUpdateCustomer = () => useCustomerMutation(customersApi.update);
export const useAttachCustomer = () => useCustomerMutation(customersApi.attach);
export const useRedeemPoints = () => useCustomerMutation(customersApi.redeem);
export const useRemoveRedemption = () => useCustomerMutation(customersApi.removeRedemption);
export const useSaveLoyaltySettings = () => useCustomerMutation(customersApi.saveSettings);
