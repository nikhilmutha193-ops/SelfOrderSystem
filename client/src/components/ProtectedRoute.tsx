import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { activateStoredAuth } from "../lib/apiClient";
import type { Role } from "../lib/types";

export default function ProtectedRoute({ role, redirectTo, children }: { role: Role; redirectTo: string; children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const token = activateStoredAuth(role);
    setOk(!!token);
    setReady(true);
  }, [role]);

  if (!ready) return null;
  if (!ok) return <Navigate to={redirectTo} replace />;
  return <>{children}</>;
}
