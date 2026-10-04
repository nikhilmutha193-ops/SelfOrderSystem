import axios from "axios";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { newId } from "../../lib/id";
import type {
  InvoiceTotals,
  OrderDetailResponse,
  OrderItem,
  PosBilling,
  SelectedModifier,
  TenderMethod,
} from "../../lib/types";
import { extractErrorMessage } from "../../shared/api/client";
import { draftUnitPrice, posApi, type DraftLine } from "./api";

export interface OfflineLine {
  key: string;
  foodItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  modifiers: SelectedModifier[];
  note: string;
  packagingCharge: number;
  components?: { name: string; quantity: number }[];
}

export interface OfflinePayment {
  method: TenderMethod;
  amount: number;
  reference?: string;
  tendered?: number;
}

export type OfflineSaleState = "open" | "waiting" | "synced" | "attention";

export interface OfflineSale {
  clientId: string;
  createdAt: string;
  orderType: "dine-in" | "takeaway";
  tableId?: string;
  tableCode?: string;
  customerName: string;
  lines: OfflineLine[];
  kotRounds: number;
  payments: OfflinePayment[];
  clientTotal: number;
  state: OfflineSaleState;
  error?: string;
  result?: {
    orderId: string;
    invoiceNumber: string | null;
    status: string;
    grandTotal: number | null;
    mismatch: boolean;
    note: string | null;
  };
  syncedAt?: string;
}

const KEY = "selforder_pos_offline_v1";
const KEEP_SYNCED_MS = 24 * 60 * 60_000;
const listeners = new Set<() => void>();
let cache: OfflineSale[] | null = null;
const NO_SALES: OfflineSale[] = [];

function load(): OfflineSale[] {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    cache = Array.isArray(parsed) ? parsed : [];
  } catch {
    cache = [];
  }
  return cache;
}

function save(next: OfflineSale[]) {
  const cutoff = Date.now() - KEEP_SYNCED_MS;
  cache = next.filter((s) => s.state !== "synced" || new Date(s.syncedAt ?? s.createdAt).getTime() > cutoff);
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    cache = [...cache];
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    cache = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useOfflineSales(): OfflineSale[] {
  return useSyncExternalStore(subscribe, load, () => NO_SALES);
}

export function offlineSales() {
  return load();
}

function updateSale(clientId: string, patch: Partial<OfflineSale>) {
  save(load().map((s) => (s.clientId === clientId ? { ...s, ...patch } : s)));
}

export function removeOfflineSale(clientId: string) {
  save(load().filter((s) => s.clientId !== clientId));
}

export function retryOfflineSale(clientId: string) {
  updateSale(clientId, { state: "waiting", error: undefined });
}

export function toOfflineLines(draft: DraftLine[]): OfflineLine[] {
  return draft.map((line) => ({
    key: line.key,
    foodItemId: line.item._id,
    name: line.item.name,
    quantity: line.quantity,
    unitPrice: draftUnitPrice(line),
    modifiers: line.modifiers,
    note: line.note,
    packagingCharge: line.item.packagingCharge ?? 0,
    components: line.item.components,
  }));
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function offlineTotals(
  lines: OfflineLine[],
  orderType: "dine-in" | "takeaway",
  billing: PosBilling | undefined
): InvoiceTotals {
  const subtotal = round2(lines.reduce((sum, l) => sum + round2(l.unitPrice * l.quantity), 0));
  const serviceChargePercent = Math.max(billing?.serviceChargePercent ?? 0, 0);
  const serviceCharge = round2((subtotal * serviceChargePercent) / 100);
  const packagingCharge =
    orderType === "takeaway" ? round2(lines.reduce((sum, l) => sum + l.packagingCharge * l.quantity, 0)) : 0;
  const taxableAmount = round2(subtotal + serviceCharge + packagingCharge);
  const taxLines = (billing?.taxRates ?? []).map((rate) => ({
    name: rate.name,
    percent: rate.percent,
    base: taxableAmount,
    amount: round2((taxableAmount * rate.percent) / 100),
  }));
  const exact = round2(taxableAmount + taxLines.reduce((sum, t) => sum + t.amount, 0));
  const grandTotal = Math.round(exact);
  return {
    subtotal,
    discount: 0,
    serviceChargePercent,
    serviceCharge,
    packagingCharge,
    taxableAmount,
    taxLines,
    roundOff: round2(grandTotal - exact),
    grandTotal,
  };
}

export interface OfflineTarget {
  orderType: "dine-in" | "takeaway";
  tableId?: string;
  tableCode?: string;
  customerName: string;
}

export function findOpenSale(target: OfflineTarget | null): OfflineSale | null {
  if (!target) return null;
  return (
    load().find(
      (s) =>
        s.state === "open" &&
        s.orderType === target.orderType &&
        (target.orderType === "takeaway" || s.tableId === target.tableId)
    ) ?? null
  );
}

export function addToOpenSale(target: OfflineTarget, lines: OfflineLine[]): OfflineSale {
  const existing = findOpenSale(target);
  if (existing) {
    const next = {
      ...existing,
      customerName: target.customerName || existing.customerName,
      lines: [...existing.lines, ...lines],
      kotRounds: existing.kotRounds + 1,
    };
    save(load().map((s) => (s.clientId === existing.clientId ? next : s)));
    return next;
  }
  const sale: OfflineSale = {
    clientId: `off-${newId()
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 24)}`,
    createdAt: new Date().toISOString(),
    orderType: target.orderType,
    tableId: target.tableId,
    tableCode: target.tableCode,
    customerName: target.customerName,
    lines,
    kotRounds: 1,
    payments: [],
    clientTotal: 0,
    state: "open",
  };
  save([...load(), sale]);
  return sale;
}

export function finishSale(
  target: OfflineTarget,
  newLines: OfflineLine[],
  billing: PosBilling | undefined,
  payments: OfflinePayment[]
): OfflineSale | null {
  const open = findOpenSale(target);
  const lines = [...(open?.lines ?? []), ...newLines];
  if (lines.length === 0) return null;
  const totals = offlineTotals(lines, target.orderType, billing);
  const base = open ?? addToOpenSale(target, []);
  const finished: OfflineSale = {
    ...base,
    customerName: target.customerName || base.customerName,
    lines,
    payments,
    clientTotal: totals.grandTotal,
    state: "waiting",
  };
  save(load().map((s) => (s.clientId === base.clientId ? finished : s)));
  return finished;
}

export function offlineDetail(sale: OfflineSale, billing: PosBilling | undefined): OrderDetailResponse {
  const items: OrderItem[] = sale.lines.map((line) => ({
    _id: line.key,
    orderId: sale.clientId,
    foodItemId: line.foodItemId,
    foodName: line.name,
    unitPrice: line.unitPrice,
    quantity: line.quantity,
    total: round2(line.unitPrice * line.quantity),
    isJain: false,
    status: "pending",
    kotRound: 1,
    tokenNumber: null,
    kotPrintedAt: sale.createdAt,
    modifiers: line.modifiers,
    note: line.note,
    components: line.components,
  }));
  return {
    order: {
      _id: sale.clientId,
      restaurantId: "",
      orderType: sale.orderType,
      customerName: sale.customerName,
      customerPhone: "",
      members: 1,
      checkinTime: sale.createdAt,
      status: "open",
      paymentMethod: "pending",
      discountAmount: 0,
    },
    items,
    totals: offlineTotals(sale.lines, sale.orderType, billing),
  };
}

export function isOfflineError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (!axios.isAxiosError(err)) return false;
  if (!err.response) return true;
  return [502, 503, 504].includes(err.response.status);
}

let running: Promise<{ synced: number; failed: number; offline: boolean }> | null = null;

export function syncOfflineSales() {
  if (running) return running;
  running = (async () => {
    let synced = 0;
    let failed = 0;
    let offline = false;
    for (const sale of load().filter((s) => s.state === "waiting")) {
      try {
        const result = await posApi.syncOffline({
          clientId: sale.clientId,
          createdAt: sale.createdAt,
          orderType: sale.orderType,
          ...(sale.tableId && { tableId: sale.tableId }),
          customerName: sale.customerName || undefined,
          clientTotal: sale.clientTotal,
          items: sale.lines.map((l) => ({
            foodItemId: l.foodItemId,
            quantity: l.quantity,
            note: l.note || undefined,
            modifiers: l.modifiers.map(({ groupName, label }) => ({ groupName, label })),
          })),
          ...(sale.payments.length > 0 && { payments: sale.payments }),
        });
        const needsAttention = result.mismatch || (sale.payments.length > 0 && result.status !== "closed");
        updateSale(sale.clientId, {
          state: needsAttention ? "attention" : "synced",
          result,
          error: undefined,
          syncedAt: new Date().toISOString(),
        });
        if (needsAttention) failed++;
        else synced++;
      } catch (err) {
        const status = axios.isAxiosError(err) ? (err.response?.status ?? 0) : 0;
        if (isOfflineError(err) || status === 429 || status >= 500) {
          offline = true;
          break;
        }
        updateSale(sale.clientId, { state: "attention", error: extractErrorMessage(err) });
        failed++;
      }
    }
    return { synced, failed, offline };
  })().finally(() => {
    running = null;
  });
  return running;
}

function subscribeOnline(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true
  );
}

export function useOfflineSync(
  enabled: boolean,
  onDone: (result: { synced: number; failed: number; offline: boolean }) => void
) {
  const sales = useOfflineSales();
  const waiting = sales.filter((s) => s.state === "waiting").length;
  const online = useOnlineStatus();
  const doneRef = useRef(onDone);
  const mounted = useRef(true);
  useEffect(() => {
    doneRef.current = onDone;
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!enabled || !online || waiting === 0) return;
    const attempt = () => {
      void syncOfflineSales().then((result) => {
        if (mounted.current && (result.synced > 0 || result.failed > 0)) doneRef.current(result);
      });
    };
    attempt();
    const id = window.setInterval(attempt, 20_000);
    return () => window.clearInterval(id);
  }, [enabled, online, waiting]);
}
