import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { queryClient } from "../shared/api/queryClient";
import ConfirmHost from "../shared/ui/ConfirmHost";
import GuestNameHost from "../shared/ui/GuestNameHost";

export default function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ConfirmHost />
      <GuestNameHost />
    </QueryClientProvider>
  );
}
