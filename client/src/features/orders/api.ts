import { compressImage } from "../../lib/imageCompress";
import { newId } from "../../lib/id";
import type {
  MyOrder,
  DeliveryProvider,
  InvoiceRegisterRow,
  ItemCancelReason,
  Order,
  OrderCoupon,
  OrderDetailResponse,
  OrderItem,
  PaymentMethod,
  TenderMethod,
} from "../../lib/types";
import { api } from "../../shared/api/client";

export interface OrderFilters {
  type?: string;
  status?: string;
  /** Only this table's orders (the Tables page's Settle uses it with status "unpaid"). */
  tableId?: string;
  today?: "true";
  from?: string;
  to?: string;
}

export interface CustomerInput {
  customerName: string;
  customerPhone?: string;
  members?: number;
  /** "MM-DD" - optional, only used by the dine-in guest form for birthday offers. */
  customerBirthday?: string;
  /** Guest opted in to offers/marketing SMS - only used by the dine-in guest sign-in form. */
  customerMarketingConsent?: boolean;
}

export interface NewOrderLine {
  foodItemId: string;
  quantity: number;
  note?: string;
  isJain?: boolean;
  isPacked?: boolean;
  /** Staff only: the dish is on the house. */
  complimentary?: boolean;
  complimentaryReason?: string;
  modifiers?: { groupName: string; label: string }[];
}

export type ReportFormat = "csv" | "pdf";

export interface PaymentLine {
  method: TenderMethod;
  amount: number;
  reference?: string;
  tendered?: number;
  /** UPI: the payer's mobile number or a screenshot of the payment (one is required). */
  payerPhone?: string;
  proofKey?: string;
}

export interface DiscountInput {
  type: "percent" | "flat";
  value: number;
  reason: string;
}

export interface InvoiceRegisterFilters {
  from?: string;
  to?: string;
  number?: string;
  amount?: string;
}

const once = () => ({ headers: { "Idempotency-Key": newId() } });

export const ordersApi = {
  list: (filters: OrderFilters) => api.get<Order[]>("/orders", { params: filters }).then((res) => res.data),
  get: (orderId: string) => api.get<OrderDetailResponse>(`/orders/${orderId}`).then((res) => res.data),
  mine: () => api.get<MyOrder[]>("/orders/session/mine").then((res) => res.data),
  invoice: (orderId: string) => api.get<OrderDetailResponse>(`/orders/${orderId}/invoice`).then((res) => res.data),
  invoicePdf: (orderId: string) =>
    api.get<Blob>(`/orders/${orderId}/invoice/pdf`, { responseType: "blob" }).then((res) => res.data),
  report: (format: ReportFormat, filters: OrderFilters) =>
    api.get<Blob>(`/orders/report.${format}`, { params: filters, responseType: "blob" }),
  archive: (filters: OrderFilters) =>
    api.delete<{ archived: number; deleted: number }>("/orders", { params: filters }).then((res) => res.data),
  invoices: (filters: InvoiceRegisterFilters) =>
    api.get<InvoiceRegisterRow[]>("/orders/invoices", { params: filters }).then((res) => res.data),

  startDineIn: (input: CustomerInput) =>
    api.post<{ token: string; order: Order }>("/orders/dine-in", input, once()).then((res) => res.data),
  updateCustomer: (orderId: string, input: Partial<CustomerInput>) =>
    api.patch<Order>(`/orders/${orderId}/customer`, input).then((res) => res.data),
  startCounter: (input: CustomerInput & { tableId?: string }) =>
    api.post<Order>("/orders/counter", input, once()).then((res) => res.data),
  startTakeaway: (input: CustomerInput) => api.post<Order>("/orders/takeaway", input, once()).then((res) => res.data),
  startDelivery: (input: CustomerInput & { provider: DeliveryProvider }) =>
    api.post<Order>("/orders/delivery", input, once()).then((res) => res.data),

  addItems: (orderId: string, items: NewOrderLine[]) =>
    api.post<OrderItem[]>(`/orders/${orderId}/items`, { items }, once()).then((res) => res.data),
  cancelItem: (itemId: string, reason?: ItemCancelReason, note?: string) =>
    api.patch<OrderItem>(`/orders/items/${itemId}/cancel`, { reason, note }).then((res) => res.data),

  printBill: (orderId: string) => api.post<{ queued: number }>(`/orders/${orderId}/bill/print`).then((res) => res.data),
  generateBill: (orderId: string, customerGstin?: string) =>
    api.post<Order>(`/orders/${orderId}/bill`, { customerGstin }).then((res) => res.data),
  reopenBill: (orderId: string, reason: string) =>
    api.post<Order>(`/orders/${orderId}/reopen`, { reason }).then((res) => res.data),
  voidBill: (orderId: string, reason: string) =>
    api.post<Order>(`/orders/${orderId}/void`, { reason }).then((res) => res.data),
  pay: (orderId: string, paymentMethod: PaymentMethod) =>
    api.patch<Order>(`/orders/${orderId}/pay`, { paymentMethod }).then((res) => res.data),
  /** Keeps a screenshot of a UPI payment (private storage) and returns its key to send when settling. */
  uploadPaymentProof: async (orderId: string, file: File) => {
    const formData = new FormData();
    formData.append("image", await compressImage(file));
    return api
      .post<{ proofKey: string }>(`/orders/${orderId}/payment-proof`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((res) => res.data.proofKey);
  },
  paymentProofBlob: (orderId: string, proofKey: string) =>
    api.get<Blob>(`/orders/${orderId}/payment-proof/${proofKey}`, { responseType: "blob" }).then((res) => res.data),
  /** The guest asks to pay at the counter: their table is released and the bill stays open for staff. */
  payAtCounter: (orderId: string) =>
    api.post<{ released: boolean }>(`/orders/${orderId}/pay-at-counter`).then((res) => res.data),
  settle: (orderId: string, payments: PaymentLine[]) =>
    api.patch<Order>(`/orders/${orderId}/pay`, { payments }).then((res) => res.data),
  split: (orderId: string, itemIds: string[]) =>
    api.post<{ order: Order; created: Order }>(`/orders/${orderId}/split`, { itemIds }).then((res) => res.data),
  merge: (orderId: string, intoOrderId: string) =>
    api.post<Order>(`/orders/${orderId}/merge`, { intoOrderId }).then((res) => res.data),
  transfer: (orderId: string, tableId: string) =>
    api.post<Order>(`/orders/${orderId}/transfer`, { tableId }).then((res) => res.data),
  setDiscount: (orderId: string, input: DiscountInput) =>
    api.put<Order>(`/orders/${orderId}/discount`, input).then((res) => res.data),
  removeDiscount: (orderId: string) => api.delete<Order>(`/orders/${orderId}/discount`).then((res) => res.data),
  setServiceCharge: (orderId: string, waived: boolean) =>
    api.put<Order>(`/orders/${orderId}/service-charge`, { waived }).then((res) => res.data),
  setPackagingWaived: (orderId: string, waived: boolean) =>
    api.put<Order>(`/orders/${orderId}/packaging`, { waived }).then((res) => res.data),
  setExtraCharge: (orderId: string, key: string, applied: boolean) =>
    api.put(`/orders/${orderId}/extra-charges`, { key, applied }).then((res) => res.data),
  setPacked: (itemId: string, packed: boolean) =>
    api.patch<OrderItem>(`/orders/items/${itemId}/packed`, { packed }).then((res) => res.data),
  complimentary: (itemId: string, reason: string) =>
    api.patch<OrderItem>(`/orders/items/${itemId}/complimentary`, { reason }).then((res) => res.data),
  freeTables: () => api.get<{ _id: string; code: string }[]>("/tables/available").then((res) => res.data),
  cancel: (orderId: string, reason?: string) =>
    api.patch<Order>(`/orders/${orderId}/cancel`, { reason }).then((res) => res.data),

  coupons: (orderId: string) =>
    api.get<{ subtotal: number; coupons: OrderCoupon[] }>(`/orders/${orderId}/coupons`).then((res) => res.data),
  applyCoupon: (orderId: string, code: string) =>
    api.post(`/orders/${orderId}/coupon`, { code }).then((res) => res.data),
  removeCoupon: (orderId: string) => api.delete(`/orders/${orderId}/coupon`).then((res) => res.data),
};
