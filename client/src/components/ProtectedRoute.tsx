import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { activateStoredAuth, wasSessionExpired } from "../lib/apiClient";
import type { Role } from "../lib/types";

export default function ProtectedRoute({
  role,
  redirectTo,
  children,
}: {
  role: Role;
  redirectTo: string;
  children: ReactNode;
}) {
  const token = activateStoredAuth(role);

  if (!token) {
    const to = wasSessionExpired(role) ? `${redirectTo}?expired=1` : redirectTo;
    return <Navigate to={to} replace />;
  }
  return <>{children}</>;
}
