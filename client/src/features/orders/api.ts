import { newId } from "../../lib/id";
import type {
  DeliveryProvider,
  InvoiceRegisterRow,
  ItemCancelReason,
  Order,
  OrderCoupon,
  OrderDetailResponse,
  OrderItem,
  PaymentMethod,
} from "../../lib/types";
import { api } from "../../shared/api/client";

export interface OrderFilters {
  type?: string;
  status?: string;
  today?: "true";
  from?: string;
  to?: string;
}

export interface CustomerInput {
  customerName: string;
  customerPhone?: string;
  members?: number;
}

export interface NewOrderLine {
  foodItemId: string;
  quantity: number;
  note?: string;
  isJain?: boolean;
  modifiers?: { groupName: string; label: string }[];
}

export type ReportFormat = "csv" | "pdf";

const once = () => ({ headers: { "Idempotency-Key": newId() } });

export const ordersApi = {
  list: (filters: OrderFilters) => api.get<Order[]>("/orders", { params: filters }).then((res) => res.data),
  get: (orderId: string) => api.get<OrderDetailResponse>(`/orders/${orderId}`).then((res) => res.data),
  invoice: (orderId: string) => api.get<OrderDetailResponse>(`/orders/${orderId}/invoice`).then((res) => res.data),
  invoicePdf: (orderId: string) =>
    api.get<Blob>(`/orders/${orderId}/invoice/pdf`, { responseType: "blob" }).then((res) => res.data),
  report: (format: ReportFormat, filters: OrderFilters) =>
    api.get<Blob>(`/orders/report.${format}`, { params: filters, responseType: "blob" }),
  archive: (filters: OrderFilters) =>
    api.delete<{ archived: number; deleted: number }>("/orders", { params: filters }).then((res) => res.data),
  invoices: (range: { from?: string; to?: string }) =>
    api.get<InvoiceRegisterRow[]>("/orders/invoices", { params: range }).then((res) => res.data),

  startDineIn: (input: CustomerInput) =>
    api.post<{ token: string; order: Order }>("/orders/dine-in", input, once()).then((res) => res.data),
  startCounter: (input: CustomerInput & { tableId?: string }) =>
    api.post<Order>("/orders/counter", input, once()).then((res) => res.data),
  startTakeaway: (input: CustomerInput) => api.post<Order>("/orders/takeaway", input, once()).then((res) => res.data),
  startDelivery: (input: CustomerInput & { provider: DeliveryProvider }) =>
    api.post<Order>("/orders/delivery", input, once()).then((res) => res.data),

  addItems: (orderId: string, items: NewOrderLine[]) =>
    api.post<OrderItem[]>(`/orders/${orderId}/items`, { items }, once()).then((res) => res.data),
  cancelItem: (itemId: string, reason?: ItemCancelReason, note?: string) =>
    api.patch<OrderItem>(`/orders/items/${itemId}/cancel`, { reason, note }).then((res) => res.data),

  generateBill: (orderId: string, customerGstin?: string) =>
    api.post<Order>(`/orders/${orderId}/bill`, { customerGstin }).then((res) => res.data),
  reopenBill: (orderId: string, reason: string) =>
    api.post<Order>(`/orders/${orderId}/reopen`, { reason }).then((res) => res.data),
  voidBill: (orderId: string, reason: string) =>
    api.post<Order>(`/orders/${orderId}/void`, { reason }).then((res) => res.data),
  pay: (orderId: string, paymentMethod: PaymentMethod) =>
    api.patch<Order>(`/orders/${orderId}/pay`, { paymentMethod }).then((res) => res.data),
  cancel: (orderId: string, reason?: string) =>
    api.patch<Order>(`/orders/${orderId}/cancel`, { reason }).then((res) => res.data),

  coupons: (orderId: string) =>
    api.get<{ subtotal: number; coupons: OrderCoupon[] }>(`/orders/${orderId}/coupons`).then((res) => res.data),
  applyCoupon: (orderId: string, code: string) =>
    api.post(`/orders/${orderId}/coupon`, { code }).then((res) => res.data),
  removeCoupon: (orderId: string) => api.delete(`/orders/${orderId}/coupon`).then((res) => res.data),
};
