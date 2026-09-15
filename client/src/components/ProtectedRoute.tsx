import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { activateStoredAuth, wasSessionExpired } from "../lib/apiClient";
import type { Role } from "../lib/types";

export default function ProtectedRoute({ role, redirectTo, children }: { role: Role; redirectTo: string; children: ReactNode }) {
  // Evaluated on every render rather than in an effect or cached state. An effect
  // runs after child effects, letting the page fire unauthenticated requests; cached
  // state goes stale because React reuses this instance across sibling routes, so a
  // session that died mid-visit would still read as valid. The call only reads
  // storage and is safe to repeat.
  const token = activateStoredAuth(role);

  if (!token) {
    const to = wasSessionExpired(role) ? `${redirectTo}?expired=1` : redirectTo;
    return <Navigate to={to} replace />;
  }
  return <>{children}</>;
}
