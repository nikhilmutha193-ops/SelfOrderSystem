import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { refreshOrderData } from "../orders/queries";
import { shiftKeys } from "../shifts/queries";
import { customersApi, type Segment } from "./api";

export const customerKeys = {
  all: ["customers"] as const,
  list: (segment?: Segment, q?: string) => ["customers", "list", segment ?? "all", q ?? ""] as const,
  profile: (id: string) => ["customers", "profile", id] as const,
  order: (orderId: string) => ["orders", "customer", orderId] as const,
  settings: ["customers", "settings"] as const,
  credit: (id: string) => ["customers", "credit", id] as const,
  dues: ["customers", "dues"] as const,
  birthdaySmsSettings: ["customers", "birthdaySmsSettings"] as const,
  smsTemplates: ["customers", "smsTemplates"] as const,
  smsCampaigns: ["customers", "smsCampaigns"] as const,
};

export const useCustomerCredit = (id: string | null) =>
  useQuery({
    queryKey: customerKeys.credit(id ?? ""),
    queryFn: () => customersApi.credit(id!),
    enabled: !!id,
  });

export const useDues = (enabled = true) =>
  useQuery({
    queryKey: customerKeys.dues,
    queryFn: customersApi.dues,
    enabled,
  });

export const useCustomers = (segment?: Segment, q?: string) =>
  useQuery({
    queryKey: customerKeys.list(segment, q),
    queryFn: () => customersApi.list({ segment, q }),
  });

export const useCustomerProfile = (id: string | null) =>
  useQuery({
    queryKey: customerKeys.profile(id ?? ""),
    queryFn: () => customersApi.profile(id!),
    enabled: !!id,
  });

export const useOrderCustomer = (orderId: string | null | undefined) =>
  useQuery({
    queryKey: customerKeys.order(orderId ?? ""),
    queryFn: () => customersApi.orderCustomer(orderId!),
    enabled: !!orderId,
  });

export const useLoyaltySettings = () => useQuery({ queryKey: customerKeys.settings, queryFn: customersApi.settings });

export const useBirthdaySmsSettings = () =>
  useQuery({ queryKey: customerKeys.birthdaySmsSettings, queryFn: customersApi.birthdaySmsSettings });

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
export const useSetCreditLimit = () => useCustomerMutation(customersApi.setCreditLimit);

export function useRecordCreditPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: customersApi.recordCreditPayment,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: customerKeys.all }),
        queryClient.invalidateQueries({ queryKey: shiftKeys.all }),
        refreshOrderData(queryClient),
      ]),
  });
}

export const useSaveBirthdaySmsSettings = () => useCustomerMutation(customersApi.saveBirthdaySmsSettings);
export const useSendBirthdaySmsNow = () => useMutation({ mutationFn: customersApi.sendBirthdaySmsNow });

export const useSmsTemplates = () =>
  useQuery({ queryKey: customerKeys.smsTemplates, queryFn: customersApi.smsTemplates });

export const useSmsCampaigns = () =>
  useQuery({ queryKey: customerKeys.smsCampaigns, queryFn: customersApi.smsCampaigns });

function useSmsTemplateMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customerKeys.smsTemplates }),
  });
}

export const useCreateSmsTemplate = () => useSmsTemplateMutation(customersApi.createSmsTemplate);
export const useUpdateSmsTemplate = () => useSmsTemplateMutation(customersApi.updateSmsTemplate);
export const useDeleteSmsTemplate = () => useSmsTemplateMutation(customersApi.deleteSmsTemplate);

export const useSendSmsCampaign = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: customersApi.sendSmsCampaign,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customerKeys.smsCampaigns }),
  });
};
