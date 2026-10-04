import type {
  BillShare,
  BirthdaySmsSettings,
  CreditEntry,
  CustomerCredit,
  CustomerDue,
  CustomerProfile,
  CustomerSummary,
  LoyaltySettings,
  OrderCustomer,
  PublicBill,
  SmsCampaign,
  SmsTemplate,
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

export interface CreditPaymentInput {
  amount: number;
  method: "cash" | "upi" | "card" | "online";
  reference?: string;
  note?: string;
}

export const customersApi = {
  credit: (id: string) => api.get<CustomerCredit>(`/credit/customers/${id}`).then((res) => res.data),
  dues: () => api.get<CustomerDue[]>("/credit/dues").then((res) => res.data),
  setCreditLimit: ({ id, creditLimit }: { id: string; creditLimit: number | null }) =>
    api
      .put<{ creditLimit: number | null }>(`/credit/customers/${id}/limit`, {
        creditLimit,
      })
      .then((res) => res.data),
  recordCreditPayment: ({ id, input }: { id: string; input: CreditPaymentInput }) =>
    api
      .post<{ entry: CreditEntry; balance: number }>(`/credit/customers/${id}/payments`, input)
      .then((res) => res.data),
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
    api
      .post<OrderCustomer>(`/customers/orders/${orderId}/attach`, {
        phone,
        name,
      })
      .then((res) => res.data),
  redeem: ({ orderId, points }: { orderId: string; points: number }) =>
    api.post<OrderCustomer>(`/customers/orders/${orderId}/redeem`, { points }).then((res) => res.data),
  removeRedemption: (orderId: string) =>
    api.delete<OrderCustomer>(`/customers/orders/${orderId}/redeem`).then((res) => res.data),
  settings: () => api.get<LoyaltySettings>("/customers/settings").then((res) => res.data),
  saveSettings: (input: LoyaltySettings) =>
    api.put<LoyaltySettings>("/customers/settings", input).then((res) => res.data),
  birthdaySmsSettings: () =>
    api.get<BirthdaySmsSettings>("/customers/birthday-sms-settings").then((res) => res.data),
  saveBirthdaySmsSettings: (input: BirthdaySmsSettings) =>
    api.put<BirthdaySmsSettings>("/customers/birthday-sms-settings", input).then((res) => res.data),
  sendBirthdaySmsNow: () =>
    api.post<{ sentCount: number }>("/customers/birthday-sms-settings/send").then((res) => res.data),
  shareBill: (orderId: string) => api.post<BillShare>(`/bills/${orderId}/share`).then((res) => res.data),
  publicBill: (token: string) => api.get<PublicBill>(`/bills/public/${token}`).then((res) => res.data),
  smsTemplates: () => api.get<SmsTemplate[]>("/customers/sms/templates").then((res) => res.data),
  createSmsTemplate: (input: { name: string; message: string }) =>
    api.post<SmsTemplate>("/customers/sms/templates", input).then((res) => res.data),
  updateSmsTemplate: ({ id, input }: { id: string; input: { name: string; message: string } }) =>
    api.put<SmsTemplate>(`/customers/sms/templates/${id}`, input).then((res) => res.data),
  deleteSmsTemplate: (id: string) => api.delete(`/customers/sms/templates/${id}`).then(() => undefined),
  smsCampaigns: () => api.get<SmsCampaign[]>("/customers/sms/campaigns").then((res) => res.data),
  sendSmsCampaign: (message: string) =>
    api.post<SmsCampaign>("/customers/sms/campaigns", { message }).then((res) => res.data),
};
