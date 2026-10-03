import { newId } from "../../lib/id";
import type { Order, OrderItem, PosFloor, PosMenu, PosMenuItem, SelectedModifier } from "../../lib/types";
import { api } from "../../shared/api/client";
import type { NewOrderLine } from "../orders/api";

export interface DraftLine {
  key: string;
  item: PosMenuItem;
  quantity: number;
  modifiers: SelectedModifier[];
  note: string;
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
    modifiers: line.modifiers.map(({ groupName, label }) => ({
      groupName,
      label,
    })),
  }));
}

export function draftUnitPrice(line: DraftLine): number {
  return line.item.price + line.modifiers.reduce((sum, m) => sum + m.priceDelta, 0);
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
  createOrder: (input: CreatePosOrderInput) =>
    api
      .post<CreatePosOrderResult>("/pos/orders", input, {
        headers: { "Idempotency-Key": newId() },
      })
      .then((res) => res.data),
  syncOffline: (input: OfflineSyncInput) =>
    api.post<OfflineSyncResult>("/pos/offline-orders", input).then((res) => res.data),
};
