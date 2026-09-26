import type { KotQueueGroup, OrderItem } from "../../lib/types";
import { api } from "../../shared/api/client";

export interface KotPrintResult {
  round: number | null;
  tokenNumber?: number;
  items: OrderItem[];
  message?: string;
}

export const kitchenApi = {
  queue: (tableId?: string) =>
    api
      .get<KotQueueGroup[]>("/orders/kot/queue", { params: tableId ? { tableId } : undefined })
      .then((res) => res.data),
  printKot: (orderId: string) => api.post<KotPrintResult>(`/orders/${orderId}/kot/print`).then((res) => res.data),
  kotPdf: (orderId: string, round: number) =>
    api.get<Blob>(`/orders/${orderId}/kot/${round}/pdf`, { responseType: "blob" }).then((res) => res.data),
  startPreparing: (itemId: string) => api.patch<OrderItem>(`/orders/items/${itemId}/preparing`).then((res) => res.data),
  markReady: (itemId: string) => api.patch<OrderItem>(`/orders/items/${itemId}/ready`).then((res) => res.data),
  serve: (itemId: string) => api.patch<OrderItem>(`/orders/items/${itemId}/serve`).then((res) => res.data),
};

export async function openPdfInTab(tab: Window | null, loadPdf: () => Promise<Blob>): Promise<void> {
  try {
    const blob = await loadPdf();
    if (tab) tab.location.href = URL.createObjectURL(blob);
  } catch (err) {
    tab?.close();
    throw err;
  }
}
