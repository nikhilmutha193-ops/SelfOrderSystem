import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import type { Role } from "../lib/types";
import { activateStoredAuth, wasSessionExpired } from "../shared/api/client";

export default function ProtectedRoute({
  role,
  redirectTo,
  children,
}: {
  role: Role;
  redirectTo: string;
  children: ReactNode;
}) {
  const location = useLocation();
  const token = activateStoredAuth(role);

  if (!token) {
    const params = new URLSearchParams();
    if (wasSessionExpired(role)) params.set("expired", "1");
    if (role === "admin") params.set("next", location.pathname + location.search);
    const query = params.toString();
    return <Navigate to={query ? `${redirectTo}?${query}` : redirectTo} replace />;
  }
  return <>{children}</>;
}
