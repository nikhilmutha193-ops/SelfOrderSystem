import { useState } from "react";

import type { ChatConversation } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { POLL } from "../../../shared/api/queryClient";
import { Button, ErrorText, Input } from "../../../shared/ui/ui";
import { useChatThread, useSendChatMessage } from "../../chat/queries";
import { tableCode } from "../tableCode";

function when(iso: string) {
  return new Date(iso).toLocaleTimeString([], { timeStyle: "short" });
}

function Thread({ orderId }: { orderId: string }) {
  const thread = useChatThread(orderId, POLL.conversationThread);
  const send = useSendChatMessage();
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const messages = (thread.data ?? []).slice(-6);

  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-slate-100 pt-2">
      {messages.map((m) => (
        <p
          key={m._id}
          className={`max-w-[85%] rounded-lg px-3 py-1.5 text-sm ${
            m.senderRole === "admin"
              ? "self-end bg-orange-100 text-orange-900"
              : "self-start bg-slate-100 text-slate-800"
          }`}
        >
          {m.message}
        </p>
      ))}
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!reply.trim()) return;
          setError(null);
          try {
            await send.mutateAsync({ orderId, message: reply.trim() });
            setReply("");
          } catch (err) {
            setError(extractErrorMessage(err));
          }
        }}
      >
        <Input placeholder="Reply, e.g. Coming now" value={reply} onChange={(e) => setReply(e.target.value)} />
        <Button type="submit" disabled={send.isPending || !reply.trim()}>
          Send
        </Button>
      </form>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

export function RequestFeed({ conversations }: { conversations: ChatConversation[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3 p-3">
      {conversations.length === 0 && <p className="py-10 text-center text-sm text-slate-500">No guest requests.</p>}
      {conversations.map((c) => {
        const code = tableCode(c.order);
        return (
          <div key={c.orderId} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <button
              type="button"
              className="flex w-full items-start justify-between gap-3 text-left"
              onClick={() => setOpenId(openId === c.orderId ? null : c.orderId)}
            >
              <span className="min-w-0">
                <span className="block font-semibold text-slate-800">
                  {code ? `Table ${code}` : c.order.customerName}
                  {c.unreadCount > 0 && (
                    <span className="ml-2 rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">
                      {c.unreadCount}
                    </span>
                  )}
                </span>
                <span className="block truncate text-sm text-slate-600">{c.lastMessage}</span>
              </span>
              <span className="shrink-0 text-xs text-slate-400">{when(c.lastAt)}</span>
            </button>
            {openId === c.orderId && <Thread orderId={c.orderId} />}
          </div>
        );
      })}
    </div>
  );
}
