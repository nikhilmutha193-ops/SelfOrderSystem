import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ChatConversation, ChatMessage } from "../../lib/types";
import { chatApi } from "./api";

export const chatKeys = {
  all: ["chat"] as const,
  conversations: ["chat", "conversations"] as const,
  thread: (orderId: string) => ["chat", "thread", orderId] as const,
};

export function useConversations(refetchInterval: number) {
  return useQuery({ queryKey: chatKeys.conversations, queryFn: chatApi.conversations, refetchInterval });
}

export function useChatThread(orderId: string | null | undefined, refetchInterval: number) {
  return useQuery({
    queryKey: chatKeys.thread(orderId ?? ""),
    queryFn: () => chatApi.thread(orderId!),
    enabled: !!orderId,
    refetchInterval,
  });
}

export function useSendChatMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, message }: { orderId: string; message: string }) => chatApi.send(orderId, message),
    onSuccess: (sent, { orderId }) => {
      queryClient.setQueryData<ChatMessage[]>(chatKeys.thread(orderId), (prev) => (prev ? [...prev, sent] : [sent]));
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations });
    },
  });
}

export function useDeleteChatMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: chatApi.remove,
    onSuccess: (_result, messageId) => {
      queryClient.setQueriesData<ChatMessage[]>({ queryKey: ["chat", "thread"] }, (prev) =>
        prev?.filter((m) => m._id !== messageId)
      );
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations });
    },
  });
}

export function useMarkAllChatsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: chatApi.markAllRead,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: chatKeys.all }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]),
  });
}

export function markConversationRead(queryClient: ReturnType<typeof useQueryClient>, orderId: string): void {
  queryClient.setQueryData<ChatConversation[]>(chatKeys.conversations, (prev) =>
    prev?.map((c) => (c.orderId === orderId ? { ...c, unreadCount: 0 } : c))
  );
}
