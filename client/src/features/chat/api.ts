import type { ChatConversation, ChatMessage } from "../../lib/types";
import { api } from "../../shared/api/client";

export const chatApi = {
  conversations: () => api.get<ChatConversation[]>("/orders/chat/active").then((res) => res.data),
  thread: (orderId: string) => api.get<ChatMessage[]>(`/orders/${orderId}/chat`).then((res) => res.data),
  send: (orderId: string, message: string) =>
    api.post<ChatMessage>(`/orders/${orderId}/chat`, { message }).then((res) => res.data),
  remove: (messageId: string) => api.delete(`/orders/chat/${messageId}`).then((res) => res.data),
  markAllRead: () => api.patch("/orders/chat/read-all").then((res) => res.data),
};
