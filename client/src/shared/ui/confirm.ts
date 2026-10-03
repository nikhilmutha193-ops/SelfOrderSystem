import type { ReactNode } from "react";

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
}

export interface PendingConfirm extends ConfirmOptions {
  id: number;
  resolve: (ok: boolean) => void;
}

let queue: PendingConfirm[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    queue = [...queue, { ...options, id: nextId++, resolve }];
    notify();
  });
}

export function subscribeConfirm(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function currentConfirm(): PendingConfirm | null {
  return queue[0] ?? null;
}

export function settleConfirm(id: number, ok: boolean) {
  const pending = queue.find((p) => p.id === id);
  if (!pending) return;
  queue = queue.filter((p) => p.id !== id);
  pending.resolve(ok);
  notify();
}
