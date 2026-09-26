import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: true,
      refetchIntervalInBackground: false,
    },
    mutations: {
      retry: false,
    },
  },
});

export const POLL = {
  kitchenQueue: 6000,
  notifications: 10000,
  activeOrders: 20000,
  guestChat: 6000,
  guestInvoice: 8000,
  conversations: 8000,
  conversationThread: 4000,
} as const;
