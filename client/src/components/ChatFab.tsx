import { useEffect, useRef, useState } from "react";

import { api, extractErrorMessage } from "../lib/apiClient";
import { QUICK_REQUESTS } from "../lib/quickRequests";
import type { ChatMessage } from "../lib/types";
import { useTableSession } from "../lib/useTableSession";
import { Button, ErrorText, Input } from "./ui";

function SupportIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="7" r="4" />
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    </svg>
  );
}

export default function ChatFab() {
  const { orderId } = useTableSession();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [quickSending, setQuickSending] = useState<string | null>(null);
  const [seenCount, setSeenCount] = useState(0);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!orderId) return;
    function load() {
      api
        .get<ChatMessage[]>(`/orders/${orderId}/chat`)
        .then((res) => setMessages(res.data))
        .catch(() => {
          // Chat is a convenience feature - stay quiet on background poll failures.
        });
    }
    load();
    const interval = setInterval(load, 6000);
    return () => clearInterval(interval);
  }, [orderId]);

  useEffect(() => {
    if (open) {
      setSeenCount(messages.length);
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [open, messages.length]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  if (!orderId) return null;

  const unread = open ? 0 : messages.length - seenCount;

  async function sendMessage(message: string): Promise<boolean> {
    if (!message.trim() || !orderId) return false;
    try {
      const res = await api.post<ChatMessage>(`/orders/${orderId}/chat`, { message: message.trim() });
      setMessages((prev) => [...prev, res.data]);
      return true;
    } catch (err) {
      setError(extractErrorMessage(err));
      return false;
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    setError(null);
    if (await sendMessage(draft)) setDraft("");
    setSending(false);
  }

  async function sendQuick(req: (typeof QUICK_REQUESTS)[number]) {
    if (quickSending) return;
    setQuickSending(req.label);
    setError(null);
    await sendMessage(req.message);
    setQuickSending(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Chat with support"
        className="fixed bottom-5 left-5 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-slate-800 text-white shadow-lg hover:bg-slate-900"
      >
        <SupportIcon className="h-6 w-6" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-red-600 px-1 text-[11px] font-semibold">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex w-full max-w-md flex-col rounded-lg bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                <SupportIcon className="h-4 w-4 text-slate-500" /> Chat &amp; assist
              </h2>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-600"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="mb-2">
              <p className="mb-1.5 text-xs font-medium text-slate-500">Quick assist</p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_REQUESTS.map((req) => (
                  <button
                    key={req.label}
                    type="button"
                    onClick={() => sendQuick(req)}
                    disabled={quickSending === req.label}
                    className="flex items-center gap-1 rounded-full border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60"
                  >
                    <span aria-hidden>{req.emoji}</span>
                    {quickSending === req.label ? "Sending..." : req.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex h-64 flex-col gap-2 overflow-y-auto rounded-md border border-slate-100 bg-slate-50 p-3">
              {messages.length === 0 && (
                <p className="py-8 text-center text-sm text-slate-400">
                  Send a message if you need anything - extra napkins, a question about a dish, anything at all.
                </p>
              )}
              {messages.map((msg) => (
                <div
                  key={msg._id}
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    msg.senderRole === "table"
                      ? "self-end bg-orange-600 text-white"
                      : "self-start bg-white text-slate-800 shadow-sm"
                  }`}
                >
                  <p>{msg.message}</p>
                  <p
                    className={`mt-1 text-[10px] ${msg.senderRole === "table" ? "text-orange-100" : "text-slate-400"}`}
                  >
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <ErrorText>{error}</ErrorText>

            <form onSubmit={send} className="mt-3 flex gap-2">
              <Input
                className="flex-1"
                placeholder="Type a message..."
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <Button type="submit" disabled={sending || !draft.trim()}>
                Send
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
