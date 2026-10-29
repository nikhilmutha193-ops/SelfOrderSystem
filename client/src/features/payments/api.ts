import type {
  OnlineCheckout,
  PaymentAttempt,
  PaymentAttemptStatus,
  PaymentGatewaySettings,
  PaymentGatewaySettingsInput,
} from "../../lib/types";
import { api } from "../../shared/api/client";

export interface RazorpayConfirmation {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export const paymentsApi = {
  settings: () => api.get<PaymentGatewaySettings>("/payments/settings").then((res) => res.data),
  saveSettings: (input: PaymentGatewaySettingsInput) =>
    api.put<PaymentGatewaySettings>("/payments/settings", input).then((res) => res.data),
  attention: () => api.get<PaymentAttempt[]>("/payments/attention").then((res) => res.data),
  checkout: (orderId: string) =>
    api.post<OnlineCheckout>(`/payments/orders/${orderId}/checkout`).then((res) => res.data),
  confirm: (input: RazorpayConfirmation) =>
    api.post<{ status: PaymentAttemptStatus }>("/payments/razorpay/confirm", input).then((res) => res.data),
};
