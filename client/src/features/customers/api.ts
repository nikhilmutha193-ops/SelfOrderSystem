import type {
  BillShare,
  CustomerProfile,
  CustomerSummary,
  LoyaltySettings,
  OrderCustomer,
  PublicBill,
} from "../../lib/types";
import { api } from "../../shared/api/client";

export type Segment = "regulars" | "lapsed" | "birthdays" | "consented";

export interface CustomerUpdate {
  name: string;
  birthday: string;
  anniversary: string;
  tags: string[];
  marketingConsent: boolean;
}

export const customersApi = {
  list: (params: { segment?: Segment; q?: string }) =>
    api.get<CustomerSummary[]>("/customers", { params }).then((res) => res.data),
  profile: (id: string) => api.get<CustomerProfile>(`/customers/${id}`).then((res) => res.data),
  update: ({ id, input }: { id: string; input: CustomerUpdate }) =>
    api.put<CustomerProfile>(`/customers/${id}`, input).then((res) => res.data),
  lookup: (phone: string) =>
    api
      .get<{ phone: string; customer: CustomerSummary | null }>("/customers/lookup", { params: { phone } })
      .then((res) => res.data),
  orderCustomer: (orderId: string) => api.get<OrderCustomer>(`/customers/orders/${orderId}`).then((res) => res.data),
  attach: ({ orderId, phone, name }: { orderId: string; phone: string; name?: string }) =>
    api.post<OrderCustomer>(`/customers/orders/${orderId}/attach`, { phone, name }).then((res) => res.data),
  redeem: ({ orderId, points }: { orderId: string; points: number }) =>
    api.post<OrderCustomer>(`/customers/orders/${orderId}/redeem`, { points }).then((res) => res.data),
  removeRedemption: (orderId: string) =>
    api.delete<OrderCustomer>(`/customers/orders/${orderId}/redeem`).then((res) => res.data),
  settings: () => api.get<LoyaltySettings>("/customers/settings").then((res) => res.data),
  saveSettings: (input: LoyaltySettings) =>
    api.put<LoyaltySettings>("/customers/settings", input).then((res) => res.data),
  shareBill: (orderId: string) => api.post<BillShare>(`/bills/${orderId}/share`).then((res) => res.data),
  publicBill: (token: string) => api.get<PublicBill>(`/bills/public/${token}`).then((res) => res.data),
};
