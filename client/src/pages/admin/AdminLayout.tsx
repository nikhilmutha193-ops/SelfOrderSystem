import { useQuery } from "@tanstack/react-query";
import {
  Check,
  Ellipsis,
  HelpCircle,
  Menu,
  MonitorSmartphone,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  PinOff,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";

import {
  findActiveNav,
  isNavActive,
  MOBILE_TAB_LABELS,
  MOBILE_TABS,
  visibleNav,
  type AdminNavGroup,
  type AdminNavItem,
} from "../../app/adminNav";
import CommandPalette from "../../app/shell/CommandPalette";
import UserMenu from "../../app/shell/UserMenu";
import NotificationCenter from "../../features/dashboard/components/NotificationCenter";
import ActiveOrders from "../../features/orders/components/ActiveOrders";
import { AdminProfileProvider, can, useAdmin } from "../../lib/adminAuth";
import { activateStoredAuth, api, clearStoredToken, setActiveAuth } from "../../shared/api/client";
import { useStaffTheme } from "../../shared/theme";
import { TourProvider, useTour } from "../../shared/ui/PageTour";
import { buttonClass } from "../../shared/ui/styles";
import { IconButton } from "../../shared/ui/ui";

const PINS_KEY = "selforder_admin_nav_pins";
const COLLAPSE_KEY = "selforder_admin_nav_collapsed";

function readStorage<T>(key: string, parse: (raw: string | null) => T, fallback: T): T {
  try {
    return parse(localStorage.getItem(key));
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    return;
  }
}

function parsePins(raw: string | null): string[] {
  const parsed = raw ? JSON.parse(raw) : [];
  return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
}

interface Branding {
  name: string;
  logoUrl?: string;
}

function useBranding() {
  return useQuery({
    queryKey: ["restaurant", "public"],
    queryFn: () => api.get<Branding>("/restaurant/public").then((r) => r.data),
    staleTime: 10 * 60 * 1000,
  });
}

function Brand({ compact }: { compact: "always" | "responsive" | "never" }) {
  const { data } = useBranding();
  const name = data?.name || "Restaurant";
  const label = compact === "always" ? "hidden" : compact === "responsive" ? "hidden lg:block" : "block";
  return (
    <Link to="/admin" className="flex min-w-0 items-center gap-3 rounded-lg" title={name}>
      {data?.logoUrl ? (
        <img src={data.logoUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-slate-200" />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-orange-700 text-sm font-bold text-white">
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className={`min-w-0 ${label}`}>
        <span className="block truncate text-sm font-semibold text-slate-900">{name}</span>
        <span className="block text-xs text-slate-500">Admin console</span>
      </span>
    </Link>
  );
}

function NavRow({
  item,
  active,
  labelClass,
  rowClass,
  editing,
  pinned,
  onTogglePin,
  onNavigate,
}: {
  item: AdminNavItem;
  active: boolean;
  labelClass: string;
  rowClass: string;
  editing: boolean;
  pinned: boolean;
  onTogglePin: (to: string) => void;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const base = `group flex min-h-[44px] w-full items-center gap-3 rounded-lg text-sm font-medium transition-colors sm:min-h-[40px] ${rowClass}`;
  if (editing) {
    return (
      <button
        type="button"
        onClick={() => onTogglePin(item.to)}
        aria-pressed={pinned}
        className={`${base} ${pinned ? "bg-orange-50 text-orange-800" : "text-slate-600 hover:bg-slate-100"}`}
      >
        <Icon size={18} className="shrink-0" aria-hidden="true" />
        <span className={`min-w-0 flex-1 truncate text-left ${labelClass}`}>{item.label}</span>
        {pinned ? (
          <PinOff size={16} className="shrink-0 text-orange-600" aria-label="Unpin" />
        ) : (
          <Pin size={16} className="shrink-0 text-slate-400" aria-label="Pin" />
        )}
      </button>
    );
  }
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      title={item.label}
      aria-current={active ? "page" : undefined}
      className={`${base} ${
        active
          ? "bg-orange-50 text-orange-700 shadow-[inset_3px_0_0_var(--color-orange-600)]"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      <Icon
        size={18}
        className={`shrink-0 ${active ? "text-orange-600" : "text-slate-400 group-hover:text-slate-600"}`}
        aria-hidden="true"
      />
      <span className={`min-w-0 flex-1 truncate ${labelClass}`}>{item.label}</span>
    </Link>
  );
}

function NavList({
  groups,
  pinned,
  mode,
  editing,
  onTogglePin,
  onNavigate,
}: {
  groups: AdminNavGroup[];
  pinned: AdminNavItem[];
  mode: "full" | "rail" | "responsive";
  editing: boolean;
  onTogglePin: (to: string) => void;
  onNavigate?: () => void;
}) {
  const { pathname, search } = useLocation();
  const labelClass = mode === "full" ? "" : mode === "rail" ? "sr-only" : "sr-only lg:not-sr-only";
  const headingClass = mode === "full" ? "block" : mode === "rail" ? "hidden" : "hidden lg:block";
  const dividerClass = mode === "full" ? "hidden" : mode === "rail" ? "block" : "block lg:hidden";
  const rowClass =
    mode === "full" ? "px-3" : mode === "rail" ? "justify-center" : "justify-center lg:justify-start lg:px-3";
  const pinnedSet = new Set(pinned.map((p) => p.to));
  const sections: AdminNavGroup[] =
    pinned.length > 0 && !editing ? [{ label: "Pinned", items: pinned }, ...groups] : groups;

  return (
    <nav aria-label="Admin" className="flex flex-col gap-4">
      {sections.map((group, gi) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          <p className={`px-3 pb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase ${headingClass}`}>
            {group.label}
          </p>
          {gi > 0 && <div className={`mx-3 mb-2 border-t border-slate-200 ${dividerClass}`} />}
          {group.items.map((item) => (
            <NavRow
              key={`${group.label}-${item.to}`}
              item={item}
              active={isNavActive(item, pathname, search)}
              labelClass={labelClass}
              rowClass={rowClass}
              editing={editing}
              pinned={pinnedSet.has(item.to)}
              onTogglePin={onTogglePin}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}

function MobileTabs({ items, onMore }: { items: AdminNavItem[]; onMore: () => void }) {
  const { pathname, search } = useLocation();
  return (
    <nav
      aria-label="Quick"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <div className="grid" style={{ gridTemplateColumns: `repeat(${items.length + 1}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const active = isNavActive(item, pathname, search);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? "page" : undefined}
              className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                active ? "text-orange-700" : "text-slate-500"
              }`}
            >
              <span
                className={`flex h-7 w-12 items-center justify-center rounded-full ${active ? "bg-orange-100" : ""}`}
              >
                <Icon size={20} aria-hidden="true" />
              </span>
              {MOBILE_TAB_LABELS[item.to] ?? item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onMore}
          className="flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-slate-500"
        >
          <span className="flex h-7 w-12 items-center justify-center rounded-full">
            <Ellipsis size={20} aria-hidden="true" />
          </span>
          More
        </button>
      </div>
    </nav>
  );
}

function Shell() {
  useStaffTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAdmin();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [collapsed, setCollapsed] = useState(() => readStorage(COLLAPSE_KEY, (raw) => raw === "1", false));
  const [pins, setPins] = useState<string[]>(() => readStorage(PINS_KEY, parsePins, []));
  const tour = useTour();

  const groups = useMemo(() => visibleNav(profile), [profile]);
  const allItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const pinned = useMemo(
    () => pins.map((to) => allItems.find((i) => i.to === to)).filter((i): i is AdminNavItem => Boolean(i)),
    [pins, allItems]
  );
  const mobileTabs = useMemo(
    () => MOBILE_TABS.map((to) => allItems.find((i) => i.to === to)).filter((i): i is AdminNavItem => Boolean(i)),
    [allItems]
  );
  const current = findActiveNav(location.pathname, location.search);

  useEffect(() => {
    activateStoredAuth("admin");
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawerOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);

  const togglePin = useCallback((to: string) => {
    setPins((prev) => {
      const next = prev.includes(to) ? prev.filter((p) => p !== to) : [...prev, to];
      writeStorage(PINS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  function toggleCollapsed() {
    setCollapsed((v) => {
      writeStorage(COLLAPSE_KEY, v ? "0" : "1");
      return !v;
    });
  }

  function logout() {
    clearStoredToken("admin");
    setActiveAuth(null);
    navigate("/admin/login", { replace: true });
  }

  const showTabs = mobileTabs.length >= 2;
  const canOrders = can(profile, "orders");

  return (
    <div className="ui-app flex min-h-dvh">
      <aside
        className={`sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200 md:flex ${
          collapsed ? "w-[76px]" : "w-[76px] lg:w-64"
        }`}
      >
        <div className="flex h-16 shrink-0 items-center px-4">
          <Brand compact={collapsed ? "always" : "responsive"} />
        </div>
        <div className="ui-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <NavList
            groups={groups}
            pinned={pinned}
            mode={collapsed ? "rail" : "responsive"}
            editing={editing && !collapsed}
            onTogglePin={togglePin}
          />
        </div>
        <div className="flex shrink-0 items-center gap-1 border-t border-slate-200 p-3">
          {!collapsed && (
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className={`hidden min-h-[40px] flex-1 items-center gap-2 rounded-lg px-3 text-sm font-medium lg:flex ${
                editing ? "bg-orange-600 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {editing ? <Check size={16} aria-hidden="true" /> : <SlidersHorizontal size={16} aria-hidden="true" />}
              {editing ? "Done" : "Pin pages"}
            </button>
          )}
          <div className={collapsed ? "mx-auto hidden lg:block" : "hidden lg:block"}>
            <IconButton
              icon={collapsed ? PanelLeftOpen : PanelLeftClose}
              label={collapsed ? "Expand menu" : "Collapse menu"}
              onClick={toggleCollapsed}
            />
          </div>
          <div className="mx-auto lg:hidden">
            <IconButton icon={PanelLeftOpen} label="Open menu" onClick={() => setDrawerOpen(true)} />
          </div>
        </div>
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50 animate-fade-in" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-80 max-w-[86vw] flex-col bg-white shadow-pop animate-drawer-in">
            <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-100 pr-2 pl-4">
              <Brand compact="never" />
              <IconButton icon={X} label="Close menu" onClick={() => setDrawerOpen(false)} />
            </div>
            <div className="ui-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <NavList
                groups={groups}
                pinned={pinned}
                mode="full"
                editing={editing}
                onTogglePin={togglePin}
                onNavigate={() => setDrawerOpen(false)}
              />
            </div>
            <div className="shrink-0 border-t border-slate-200 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                className={`flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium ${
                  editing ? "bg-orange-600 text-white" : "bg-slate-100 text-slate-700"
                }`}
              >
                {editing ? <Check size={16} aria-hidden="true" /> : <SlidersHorizontal size={16} aria-hidden="true" />}
                {editing ? "Done" : "Pin pages"}
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-slate-200 bg-white/90 px-3 backdrop-blur sm:px-4 lg:px-6">
          <div className="md:hidden">
            <IconButton icon={Menu} label="Open menu" onClick={() => setDrawerOpen(true)} aria-expanded={drawerOpen} />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {current ? (
              <div className="min-w-0">
                <p className="hidden text-xs font-medium text-slate-400 sm:block">{current.group}</p>
                <p className="truncate text-sm font-semibold text-slate-900 sm:text-base">{current.item.label}</p>
              </div>
            ) : (
              <p className="truncate text-sm font-semibold text-slate-900">Admin</p>
            )}
            {tour.hasSteps && (
              <IconButton icon={HelpCircle} label="Guide this page" onClick={tour.start} className="shrink-0" />
            )}
          </div>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="hidden h-10 w-56 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-400 transition-colors hover:border-slate-300 hover:bg-white lg:flex xl:w-72"
          >
            <Search size={16} aria-hidden="true" />
            <span className="flex-1 text-left">Search pages…</span>
            <kbd className="rounded border border-slate-200 bg-white px-1.5 text-[11px] font-medium text-slate-500">
              Ctrl K
            </kbd>
          </button>
          <div className="lg:hidden">
            <IconButton icon={Search} label="Search pages" onClick={() => setPaletteOpen(true)} />
          </div>
          {canOrders && (
            <div className="hidden xl:block">
              <Link to="/pos" className={buttonClass("soft", "md")}>
                <MonitorSmartphone size={16} aria-hidden="true" />
                POS
              </Link>
            </div>
          )}
          <div className="flex items-center gap-1">
            <ActiveOrders />
            <NotificationCenter />
          </div>
          <div className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" />
          <UserMenu onLogout={logout} />
        </header>

        <main className={`min-w-0 flex-1 px-3 py-4 sm:px-5 sm:py-6 lg:px-8 ${showTabs ? "pb-24 md:pb-8" : "pb-8"}`}>
          <Outlet />
        </main>
      </div>

      {showTabs && <MobileTabs items={mobileTabs} onMore={() => setDrawerOpen(true)} />}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} groups={groups} />
    </div>
  );
}

export default function AdminLayout() {
  return (
    <AdminProfileProvider>
      <TourProvider>
        <Shell />
      </TourProvider>
    </AdminProfileProvider>
  );
}
