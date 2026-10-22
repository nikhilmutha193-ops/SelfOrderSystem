import { LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { clearStoredToken, setActiveAuth } from "../shared/api/client";

/** Signs a counter or floor login out and returns to its own sign-in page. */
export function StaffSignOut({ to, className = "" }: { to: string; className?: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      aria-label="Sign out"
      title="Sign out"
      onClick={() => {
        clearStoredToken("admin");
        setActiveAuth(null);
        navigate(to, { replace: true });
      }}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-slate-800 hover:text-white ${className}`}
    >
      <LogOut size={18} aria-hidden="true" />
    </button>
  );
}
