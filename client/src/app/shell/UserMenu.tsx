import { ChevronDown, KeyRound, LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useAdmin } from "../../lib/adminAuth";

function initials(name: string): string {
  const parts = name
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export default function UserMenu({ onLogout }: { onLogout: () => void }) {
  const { profile } = useAdmin();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const name = profile?.username ?? "";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-11 items-center gap-2 rounded-lg pr-1 pl-1 text-sm hover:bg-slate-100 sm:h-10 sm:pr-2"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-orange-700 text-xs font-bold text-white">
          {initials(name)}
        </span>
        <span className="hidden max-w-32 truncate font-medium text-slate-700 md:inline">{name}</span>
        <ChevronDown size={16} className="hidden text-slate-400 md:block" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-pop animate-pop-in"
        >
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
            <p className="text-xs text-slate-500">{profile?.isOwner ? "Owner" : "Staff"}</p>
          </div>
          <div className="p-1.5">
            <Link
              role="menuitem"
              to="/admin/change-password"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-100"
            >
              <KeyRound size={16} className="text-slate-400" aria-hidden="true" />
              Change password
            </Link>
            <button
              role="menuitem"
              type="button"
              onClick={onLogout}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
            >
              <LogOut size={16} aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
