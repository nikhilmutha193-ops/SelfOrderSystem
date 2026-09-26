import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { useCanEdit } from "../../../lib/adminAuth";
import type { ChatConversation, ChatMessage } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { POLL } from "../../../shared/api/queryClient";
import { Badge, Button, Card, ErrorText, Input } from "../../../shared/ui/ui";
import {
  markConversationRead,
  useChatThread,
  useConversations,
  useDeleteChatMessage,
  useSendChatMessage,
} from "../queries";

const NO_CONVERSATIONS: ChatConversation[] = [];
const NO_MESSAGES: ChatMessage[] = [];

export default function Messages() {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const conversationsQuery = useConversations(POLL.conversations);
  const threadQuery = useChatThread(selectedOrderId, POLL.conversationThread);
  const sendChat = useSendChatMessage();
  const deleteChat = useDeleteChatMessage();
  const conversations = conversationsQuery.data ?? NO_CONVERSATIONS;
  const messages = threadQuery.data ?? NO_MESSAGES;
  const loadError = conversationsQuery.error ?? threadQuery.error;
  const error = actionError ?? (loadError ? extractErrorMessage(loadError) : null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const canEdit = useCanEdit("messages");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function openConversation(orderId: string) {
    setSelectedOrderId(orderId);
    markConversationRead(queryClient, orderId);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrderId || !draft.trim()) return;
    setSending(true);
    setActionError(null);
    try {
      await sendChat.mutateAsync({ orderId: selectedOrderId, message: draft.trim() });
      setDraft("");
    } catch (err) {
      setActionError(extractErrorMessage(err));
    } finally {
      setSending(false);
    }
  }

  async function deleteMessage(messageId: string) {
    if (!window.confirm("Delete this message? This cannot be undone.")) return;
    setActionError(null);
    try {
      await deleteChat.mutateAsync(messageId);
    } catch (err) {
      setActionError(extractErrorMessage(err));
    }
  }

  function describeOrder(convo: ChatConversation) {
    const order = convo.order;
    if (order.orderType === "dine-in") {
      const code = typeof order.tableId === "object" ? order.tableId?.code : "";
      return code ? `Table ${code} · ${order.customerName}` : `Counter · ${order.customerName}`;
    }
    if (order.orderType === "takeaway") return `Take away · ${order.customerName}`;
    return `Delivery (${order.deliveryProvider}) · ${order.customerName}`;
  }

  const selected = conversations.find((c) => c.orderId === selectedOrderId) || null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-800">Messages</h1>
      <p className="text-sm text-slate-500">Chat with tables currently browsing or dining, per order.</p>

      <ErrorText>{error}</ErrorText>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Conversations</h2>
          <div className="flex flex-col divide-y divide-slate-100">
            {conversations.length === 0 && <p className="py-4 text-sm text-slate-400">No conversations yet.</p>}
            {conversations.map((convo) => (
              <button
                key={convo.orderId}
                onClick={() => openConversation(convo.orderId)}
                className={`flex flex-col gap-0.5 px-2 py-2.5 text-left hover:bg-slate-50 ${
                  selectedOrderId === convo.orderId ? "bg-orange-50" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-800">{describeOrder(convo)}</span>
                  {convo.unreadCount > 0 && <Badge tone="red">{convo.unreadCount}</Badge>}
                </div>
                <span className="truncate text-xs text-slate-500">
                  {convo.lastSenderRole === "admin" ? "You: " : ""}
                  {convo.lastMessage}
                </span>
              </button>
            ))}
          </div>
        </Card>

        <Card className="flex flex-col lg:col-span-2">
          {!selected ? (
            <p className="py-8 text-center text-sm text-slate-400">Select a conversation to view messages.</p>
          ) : (
            <>
              <h2 className="mb-2 text-sm font-semibold text-slate-700">{describeOrder(selected)}</h2>
              <div className="flex h-80 flex-col gap-2 overflow-y-auto rounded-md border border-slate-100 bg-slate-50 p-3">
                {messages.map((msg) => (
                  <div
                    key={msg._id}
                    className={`group relative max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                      msg.senderRole === "admin"
                        ? "self-end bg-orange-600 text-white"
                        : "self-start bg-white text-slate-800 shadow-sm"
                    }`}
                  >
                    <p className="pr-5">{msg.message}</p>
                    {msg.flagged && (
                      <p
                        className={`mt-0.5 text-[10px] font-semibold ${msg.senderRole === "admin" ? "text-orange-100" : "text-red-500"}`}
                      >
                        ⚠ filtered for language
                      </p>
                    )}
                    <p
                      className={`mt-1 text-[10px] ${msg.senderRole === "admin" ? "text-orange-100" : "text-slate-400"}`}
                    >
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                    {canEdit && (
                      <button
                        type="button"
                        aria-label="Delete message"
                        title="Delete message"
                        onClick={() => deleteMessage(msg._id)}
                        // Always visible on touch, where there is no hover to reveal it.
                        className={`absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded text-xs opacity-100 sm:opacity-0 sm:group-hover:opacity-100 ${
                          msg.senderRole === "admin"
                            ? "text-orange-100 hover:bg-orange-700"
                            : "text-slate-400 hover:bg-slate-100"
                        }`}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
              <form onSubmit={send} className="mt-3 flex gap-2">
                <Input
                  className="flex-1"
                  placeholder="Type a reply..."
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <Button type="submit" disabled={sending || !draft.trim()}>
                  Send
                </Button>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
