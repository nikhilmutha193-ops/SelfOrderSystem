import { CornerDownLeft, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";

import type { AdminNavGroup, AdminNavItem } from "../adminNav";

interface Entry {
  group: string;
  item: AdminNavItem;
}

function score(entry: Entry, q: string): number {
  const label = entry.item.label.toLowerCase();
  if (label.startsWith(q)) return 3;
  if (label.split(/\s+/).some((w) => w.startsWith(q))) return 2;
  const hay = `${label} ${entry.group.toLowerCase()} ${entry.item.keywords ?? ""}`;
  return hay.includes(q) ? 1 : 0;
}

export default function CommandPalette({
  open,
  onClose,
  groups,
}: {
  open: boolean;
  onClose: () => void;
  groups: AdminNavGroup[];
}) {
  if (!open) return null;
  return <Palette onClose={onClose} groups={groups} />;
}

function Palette({ onClose, groups }: { onClose: () => void; groups: AdminNavGroup[] }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => {
    const entries: Entry[] = groups.flatMap((g) => g.items.map((item) => ({ group: g.label, item })));
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries
      .map((e) => ({ e, s: score(e, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.e);
  }, [groups, query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  function go(entry: Entry | undefined) {
    if (!entry) return;
    onClose();
    navigate(entry.item.to);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-3 pt-[10dvh] sm:p-4 sm:pt-[12dvh]">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Go to page"
        className="relative flex max-h-[70dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-pop animate-pop-in"
      >
        <div className="flex items-center gap-3 border-b border-slate-100 px-4">
          <Search size={18} className="shrink-0 text-slate-400" aria-hidden="true" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Go to a page…"
            aria-label="Search pages"
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-slate-900 placeholder:text-slate-400 focus:outline-none"
            style={{ outline: "none" }}
          />
          <kbd className="hidden rounded border border-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 sm:inline">
            Esc
          </kbd>
        </div>
        <ul ref={listRef} className="ui-scrollbar overflow-y-auto p-2" role="listbox">
          {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-slate-500">No pages match</li>}
          {results.map((entry, i) => {
            const Icon = entry.item.icon;
            const selected = i === active;
            return (
              <li key={entry.item.to} role="option" aria-selected={selected}>
                <button
                  type="button"
                  data-index={i}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(entry)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${
                    selected ? "bg-orange-50 text-orange-800" : "text-slate-700"
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      selected ? "bg-white text-orange-600 shadow-card" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{entry.item.label}</span>
                  <span className="shrink-0 text-xs text-slate-400">{entry.group}</span>
                  {selected && <CornerDownLeft size={14} className="hidden shrink-0 sm:block" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body
  );
}
