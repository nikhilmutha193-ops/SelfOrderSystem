import { useEffect, useRef, useState } from "react";

import type { KotQueueGroup, Order, OrderItem } from "../../lib/types";

export type Urgency = "new" | "ontime" | "soon" | "late" | "ready";
export type QueueFilter = "all" | "waiting" | "cooking" | "ready" | "unsent";

const COLLAPSE_KEY = "selforder_kot_collapsed";
const LATE_AFTER_MIN = 20;
const SOON_AFTER_MIN = 10;
const SOON_WINDOW_MS = 3 * 60_000;

export function isSent(item: OrderItem) {
  return item.kotRound != null;
}

export function itemFilter(item: OrderItem): Exclude<QueueFilter, "all"> {
  if (!isSent(item)) return "unsent";
  if (item.status === "preparing") return "cooking";
  if (item.status === "ready") return "ready";
  return "waiting";
}

export function ticketCounts(items: OrderItem[]) {
  const counts = { total: 0, waiting: 0, cooking: 0, ready: 0, unsent: 0 };
  for (const item of items) {
    counts.total += item.quantity;
    counts[itemFilter(item)] += item.quantity;
  }
  return counts;
}

export function sentAt(items: OrderItem[]): number | null {
  const times = items.map((i) => (i.kotPrintedAt ? new Date(i.kotPrintedAt).getTime() : NaN)).filter(Number.isFinite);
  return times.length ? Math.min(...times) : null;
}

export function ticketUrgency(group: KotQueueGroup, now: number): Urgency {
  const sent = sentAt(group.items);
  if (sent == null) return "new";
  if (group.items.every((i) => i.status === "ready")) return "ready";
  const eta = group.order.estimatedReadyAt ? new Date(group.order.estimatedReadyAt).getTime() : NaN;
  if (Number.isFinite(eta)) {
    if (now > eta) return "late";
    if (eta - now <= SOON_WINDOW_MS) return "soon";
    return "ontime";
  }
  const minutes = (now - sent) / 60_000;
  if (minutes >= LATE_AFTER_MIN) return "late";
  if (minutes >= SOON_AFTER_MIN) return "soon";
  return "ontime";
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function orderLabel(order: Order): { kind: string; place: string; detail: string | null } {
  const customer = order.customerName?.trim() || null;
  if (order.orderType === "dine-in") {
    const code = typeof order.tableId === "object" && order.tableId?.code ? order.tableId.code : null;
    return { kind: "Dine-in", place: code ? `Table ${code}` : "Counter", detail: customer };
  }
  if (order.orderType === "takeaway") return { kind: "Takeaway", place: customer ?? "Takeaway", detail: null };
  return { kind: "Delivery", place: customer ?? "Delivery", detail: order.deliveryProvider || null };
}

export function printedRounds(items: OrderItem[]): { round: number; token: number | null }[] {
  const map = new Map<number, number | null>();
  for (const i of items) if (i.kotRound != null && !map.has(i.kotRound)) map.set(i.kotRound, i.tokenNumber);
  return Array.from(map, ([round, token]) => ({ round, token })).sort((a, b) => b.round - a.round);
}

export function loadCollapsed(): Record<string, true> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    const ids: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids)
      ? Object.fromEntries(ids.filter((id): id is string => typeof id === "string").map((id) => [id, true as const]))
      : {};
  } catch {
    return {};
  }
}

export function saveCollapsed(map: Record<string, true>) {
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(Object.keys(map).slice(-200)));
  } catch {
    return;
  }
}

export function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function useColumnCount(minWidth: number, max: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      setColumns(Math.max(1, Math.min(max, Math.floor((width + 16) / (minWidth + 16)))));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [minWidth, max]);
  return { ref, columns };
}

export function balanceColumns<T>(entries: T[], columns: number, weight: (entry: T) => number): T[][] {
  const out: T[][] = Array.from({ length: columns }, () => []);
  const heights = new Array(columns).fill(0);
  for (const entry of entries) {
    let target = 0;
    for (let c = 1; c < columns; c++) if (heights[c] < heights[target] - 0.5) target = c;
    out[target].push(entry);
    heights[target] += weight(entry);
  }
  return out;
}
