import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { ChatConversation } from "../../../lib/types";
import { playTone } from "../../dashboard/components/NotificationCenter";
import { tableCode } from "../tableCode";

interface Toast {
  id: number;
  title: string;
  text: string;
}

const SHOW_MS = 7000;

let toastId = 0;

/**
 * Pops a toast with a bell when a table sends a new message (call waiter, a request...), wherever the
 * captain is in the app. Tapping it opens the Requests tab. Messages already waiting when the app opens
 * don't pop up: they are on the Requests badge.
 */
export function MessageToasts({
  conversations,
  ready,
  suppress,
  onOpen,
}: {
  conversations: ChatConversation[];
  /** True once the first list of conversations has loaded. */
  ready: boolean;
  /** True while the captain is already looking at the requests. */
  suppress: boolean;
  onOpen: () => void;
}) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seen = useRef<Map<string, number> | null>(null);
  const suppressRef = useRef(suppress);

  useEffect(() => {
    suppressRef.current = suppress;
  });

  useEffect(() => {
    if (!ready) return;
    const previous = seen.current;
    const next = new Map(conversations.map((c) => [c.orderId, c.unreadCount]));
    seen.current = next;
    if (!previous) return; // first load: remember what is already unread
    const fresh = conversations.filter((c) => c.unreadCount > (previous.get(c.orderId) ?? 0));
    if (fresh.length === 0 || suppressRef.current) return;
    const added = fresh.map((c): Toast => {
      const code = tableCode(c.order);
      return {
        id: ++toastId,
        title: code ? `Table ${code}` : c.order.customerName || "Guest",
        text: c.lastMessage,
      };
    });
    setToasts((current) => [...current, ...added].slice(-3));
    playTone("chime", 0.25);
    for (const toast of added) {
      setTimeout(() => setToasts((current) => current.filter((t) => t.id !== toast.id)), SHOW_MS);
    }
  }, [conversations, ready]);

  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-50 flex flex-col items-center gap-2 px-3">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => {
            setToasts((current) => current.filter((t) => t.id !== toast.id));
            onOpen();
          }}
          className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left shadow-pop animate-pop-in"
        >
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600">
            <Bell size={16} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-900">{toast.title}</span>
            <span className="block truncate text-sm text-slate-600">{toast.text}</span>
          </span>
          <span className="shrink-0 text-xs font-medium text-orange-700">Open</span>
        </button>
      ))}
    </div>
  );
}
