import type { Refund, RefundList, RefundMethod, RefundReason, RefundSummary } from "../../lib/types";
import { api } from "../../shared/api/client";

export interface NewRefund {
  orderId: string;
  items?: { itemId: string; quantity: number }[];
  amount?: number;
  method: RefundMethod;
  reason: RefundReason;
  note?: string;
}

export const refundsApi = {
  summary: (orderId: string) => api.get<RefundSummary>(`/refunds/order/${orderId}`).then((res) => res.data),
  create: (input: NewRefund) => api.post<Refund>("/refunds", input).then((res) => res.data),
  list: (from?: string, to?: string) =>
    api.get<RefundList>("/refunds", { params: { from, to } }).then((res) => res.data),
};
