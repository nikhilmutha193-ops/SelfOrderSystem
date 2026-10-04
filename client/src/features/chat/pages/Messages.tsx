import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MessagesSquare, SendHorizontal, TriangleAlert, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useCanEdit } from "../../../lib/adminAuth";
import type { ChatConversation, ChatMessage } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { POLL } from "../../../shared/api/queryClient";
import { confirmDialog } from "../../../shared/ui/confirm";
import { usePageTour, type TourStep } from "../../../shared/ui/PageTour";
import { Button, Card, EmptyState, ErrorText, IconButton, Input, Page, PageHeader } from "../../../shared/ui/ui";
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
    if (
      !(await confirmDialog({
        title: "Delete this message?",
        message: "It disappears for the guest too. This can't be undone.",
        confirmLabel: "Delete",
      }))
    )
      return;
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

  const tourSteps: TourStep[] = useMemo(
    () => [
      {
        target: "messages-panel",
        title: "Guest conversations",
        description:
          "One thread per order. Pick a conversation on the left to read and reply; a flagged message means the guest's text was filtered for language.",
      },
    ],
    []
  );
  usePageTour(tourSteps);

  return (
    <Page>
      <PageHeader title="Messages" description="Chat with guests at their table, one conversation per order." />

      <ErrorText>{error}</ErrorText>

      <Card
        data-tour="messages-panel"
        padding="none"
        className="grid h-[calc(100dvh-15rem)] min-h-[28rem] overflow-hidden lg:grid-cols-[20rem_1fr]"
      >
        <div className={`min-h-0 flex-col border-slate-200 lg:flex lg:border-r ${selected ? "hidden" : "flex"}`}>
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Conversations</h2>
          </div>
          <div className="ui-scrollbar min-h-0 flex-1 overflow-y-auto">
            {conversations.length === 0 && (
              <EmptyState
                icon={MessagesSquare}
                title="No conversations yet"
                description="Guest messages appear here."
              />
            )}
            {conversations.map((convo) => {
              const active = selectedOrderId === convo.orderId;
              return (
                <button
                  key={convo.orderId}
                  type="button"
                  onClick={() => openConversation(convo.orderId)}
                  className={`flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left transition-colors ${
                    active ? "bg-orange-50" : "hover:bg-slate-50"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      active ? "bg-orange-600 text-white" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {(convo.order.customerName || "G").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-slate-900">{describeOrder(convo)}</span>
                      {convo.unreadCount > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-600 px-1.5 text-[11px] font-bold text-white">
                          {convo.unreadCount}
                        </span>
                      )}
                    </span>
                    <span
                      className={`block truncate text-xs ${convo.unreadCount > 0 ? "font-medium text-slate-800" : "text-slate-500"}`}
                    >
                      {convo.lastSenderRole === "admin" ? "You: " : ""}
                      {convo.lastMessage}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={`min-h-0 flex-col lg:flex ${selected ? "flex" : "hidden"}`}>
          {!selected ? (
            <EmptyState
              className="h-full"
              icon={MessagesSquare}
              title="Pick a conversation"
              description="Select a guest on the left to read and reply."
            />
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-slate-100 px-2 py-2 sm:px-4">
                <div className="lg:hidden">
                  <IconButton icon={ArrowLeft} label="Back to conversations" onClick={() => setSelectedOrderId(null)} />
                </div>
                <h2 className="min-w-0 truncate text-sm font-semibold text-slate-900">{describeOrder(selected)}</h2>
              </div>
              <div className="ui-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-slate-50/70 p-4">
                {messages.map((msg) => {
                  const mine = msg.senderRole === "admin";
                  return (
                    <div
                      key={msg._id}
                      className={`group relative max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-card sm:max-w-[70%] ${
                        mine
                          ? "self-end rounded-br-md bg-orange-600 text-white"
                          : "self-start rounded-bl-md bg-white text-slate-800"
                      }`}
                    >
                      <p className={`break-words ${canEdit ? "pr-6" : ""}`}>{msg.message}</p>
                      {msg.flagged && (
                        <p
                          className={`mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold ${mine ? "text-orange-100" : "text-red-600"}`}
                        >
                          <TriangleAlert size={12} aria-hidden="true" />
                          Filtered for language
                        </p>
                      )}
                      <p className={`mt-1 text-[11px] ${mine ? "text-orange-100" : "text-slate-400"}`}>
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                      {canEdit && (
                        <button
                          type="button"
                          aria-label="Delete message"
                          title="Delete message"
                          onClick={() => deleteMessage(msg._id)}
                          style={{ minHeight: "1.75rem" }}
                          className={`absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-full opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 ${
                            mine ? "text-orange-100 hover:bg-orange-700" : "text-slate-400 hover:bg-slate-100"
                          }`}
                        >
                          <X size={14} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
              <form
                onSubmit={send}
                className="flex gap-2 border-t border-slate-100 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
              >
                <Input
                  className="flex-1"
                  placeholder="Type a reply…"
                  aria-label="Reply"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <Button
                  type="submit"
                  aria-label="Send"
                  icon={SendHorizontal}
                  loading={sending}
                  disabled={!draft.trim()}
                >
                  <span className="hidden sm:inline">Send</span>
                </Button>
              </form>
            </>
          )}
        </div>
      </Card>
    </Page>
  );
}
