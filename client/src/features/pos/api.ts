import { newId } from "../../lib/id";
import type { Order, OrderItem, PosFloor, PosMenu, PosMenuItem, PosToday, SelectedModifier } from "../../lib/types";
import { api } from "../../shared/api/client";
import type { NewOrderLine } from "../orders/api";

export interface DraftLine {
  key: string;
  item: PosMenuItem;
  quantity: number;
  modifiers: SelectedModifier[];
  note: string;
  isJain?: boolean;
  isPacked?: boolean;
  /** Complimentary: priced at zero when the order is saved. */
  complimentary?: boolean;
  /** Why it is complimentary: required when `complimentary` is set. */
  complimentaryReason?: string;
}

export interface CreatePosOrderInput {
  orderType: "dine-in" | "takeaway";
  tableId?: string;
  customerName?: string;
  customerPhone?: string;
  members?: number;
  sendToKitchen: boolean;
  items: NewOrderLine[];
}

export interface CreatePosOrderResult {
  order: Order;
  items: OrderItem[];
  kot: { round: number; tokenNumber: number } | null;
}

export function toOrderLines(lines: DraftLine[]): NewOrderLine[] {
  return lines.map((line) => ({
    foodItemId: line.item._id,
    quantity: line.quantity,
    note: line.note || undefined,
    isJain: line.isJain || undefined,
    isPacked: line.isPacked || undefined,
    complimentary: line.complimentary || undefined,
    complimentaryReason: line.complimentary ? line.complimentaryReason : undefined,
    modifiers: line.modifiers.map(({ groupName, label }) => ({
      groupName,
      label,
    })),
  }));
}

export function draftUnitPrice(line: DraftLine): number {
  return line.item.price + line.modifiers.reduce((sum, m) => sum + m.priceDelta, 0);
}

/** What the line adds to the bill: nothing when it is complimentary. */
export function draftLineTotal(line: DraftLine): number {
  return line.complimentary ? 0 : draftUnitPrice(line) * line.quantity;
}

export interface OfflineSyncInput {
  clientId: string;
  createdAt: string;
  orderType: "dine-in" | "takeaway";
  tableId?: string;
  customerName?: string;
  clientTotal: number;
  items: NewOrderLine[];
  payments?: { method: string; amount: number; reference?: string; tendered?: number }[];
}

export interface OfflineSyncResult {
  orderId: string;
  invoiceNumber: string | null;
  status: string;
  grandTotal: number | null;
  clientTotal: number | null;
  mismatch: boolean;
  note: string | null;
  duplicate: boolean;
}

export const posApi = {
  menu: () => api.get<PosMenu>("/pos/menu").then((res) => res.data),
  floor: () => api.get<PosFloor>("/pos/floor").then((res) => res.data),
  today: () => api.get<PosToday>("/pos/today").then((res) => res.data),
  /** The KOT and the invoice as separate print jobs (a slip each). */
  printBoth: (orderId: string) =>
    api.post<{ kots: number; invoices: number; rounds: number }>(`/pos/orders/${orderId}/print-both`).then((res) => res.data),
  /** The invoice was opened as a PDF to print from the browser: counts it as printed. */
  invoicePrinted: (orderId: string) => api.post(`/pos/orders/${orderId}/invoice-printed`).then((res) => res.data),
  createOrder: (input: CreatePosOrderInput) =>
    api
      .post<CreatePosOrderResult>("/pos/orders", input, {
        headers: { "Idempotency-Key": newId() },
      })
      .then((res) => res.data),
  syncOffline: (input: OfflineSyncInput) =>
    api.post<OfflineSyncResult>("/pos/offline-orders", input).then((res) => res.data),
  releaseTable: (tableId: string) =>
    api.patch<{ status: string; cancelledOrders: number }>(`/pos/tables/${tableId}/release`).then((res) => res.data),
};
