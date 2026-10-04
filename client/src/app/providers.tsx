import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { queryClient } from "../shared/api/queryClient";
import ConfirmHost from "../shared/ui/ConfirmHost";

export default function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ConfirmHost />
    </QueryClientProvider>
  );
}
