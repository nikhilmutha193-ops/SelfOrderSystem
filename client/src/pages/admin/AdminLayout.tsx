import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { activateStoredAuth, clearStoredToken, setActiveAuth } from "../../lib/apiClient";
import { Button } from "../../components/ui";
import NotificationCenter from "../../components/NotificationCenter";
import ActiveOrders from "../../components/ActiveOrders";
import { AdminProfileProvider, can, useAdmin, type ModuleKey } from "../../lib/adminAuth";

/** `module: null` means always visible (self-service). */
type NavLinkItem = { to: string; label: string; module: ModuleKey | null };
const links: NavLinkItem[] = [
  { to: "/admin/dashboard", label: "Dashboard", module: "dashboard" },
  { to: "/admin/analytics", label: "Analytics", module: "analytics" },
  { to: "/admin/categories", label: "Categories", module: "categories" },
  { to: "/admin/subcategories", label: "Subcategories", module: "subcategories" },
  { to: "/admin/food-items", label: "Food Items", module: "foodItems" },
  { to: "/admin/tables", label: "Tables", module: "tables" },
  { to: "/admin/qr-codes", label: "QR Codes", module: "tables" },
  { to: "/admin/kot", label: "Kitchen Queue", module: "kot" },
  { to: "/admin/messages", label: "Messages", module: "messages" },
  { to: "/admin/chefs", label: "Chefs", module: "chefs" },
  { to: "/admin/orders?type=dine-in", label: "Dine-in Orders", module: "orders" },
  { to: "/admin/orders?type=takeaway", label: "Take-away Orders", module: "orders" },
  { to: "/admin/delivery/new", label: "New Order", module: "orders" },
  { to: "/admin/team", label: "Team", module: "team" },
  { to: "/admin/awards", label: "Awards", module: "awards" },
  { to: "/admin/coupons", label: "Coupons", module: "coupons" },
  { to: "/admin/reviews", label: "Reviews", module: "reviews" },
  { to: "/admin/settings", label: "Restaurant Settings", module: "settings" },
  { to: "/admin/landing", label: "Landing Page", module: "landing" },
  { to: "/admin/backup", label: "Backup & Restore", module: "backup" },
  { to: "/admin/admins", label: "Admin Users", module: "admins" },
  { to: "/admin/audit", label: "Audit Log", module: "audit" },
  { to: "/admin/change-password", label: "Change Password", module: null },
];

const ORDER_KEY = "selforder_admin_nav_order";
const COLLAPSE_KEY = "selforder_admin_nav_collapsed";

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveCollapsed(v: boolean) {
  try {
    localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0");
  } catch {
    // storage unavailable - collapse just won't persist this session
  }
}

function loadOrder(): string[] {
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveOrder(order: string[]) {
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(order));
  } catch {
    // storage unavailable (private window) - the order just won't persist this session
  }
}

/** Sorts the links by the saved order; anything not in the saved list keeps its default place at the end. */
function applyOrder(list: NavLinkItem[], order: string[]): NavLinkItem[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  return list
    .map((link, i) => ({ link, i }))
    .sort((a, b) => {
      const ra = rank.has(a.link.to) ? (rank.get(a.link.to) as number) : Infinity;
      const rb = rank.has(b.link.to) ? (rank.get(b.link.to) as number) : Infinity;
      return ra !== rb ? ra - rb : a.i - b.i;
    })
    .map((x) => x.link);
}

function ArrowButton({ dir, disabled, onClick }: { dir: "up" | "down"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={dir === "up" ? "Move up" : "Move down"}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200 disabled:opacity-30"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        {dir === "up" ? <path d="M6 15l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" /> : <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
    </button>
  );
}

function SidebarContent({
  onLogout,
  onNavigate,
  onCollapse,
  order,
  setOrder,
  editing,
  setEditing,
}: {
  onLogout: () => void;
  onNavigate?: () => void;
  onCollapse?: () => void;
  order: string[];
  setOrder: (o: string[]) => void;
  editing: boolean;
  setEditing: (v: boolean) => void;
}) {
  const { profile } = useAdmin();
  const visible = applyOrder(
    links.filter((link) => link.module === null || can(profile, link.module)),
    order
  );

  function move(index: number, dir: -1 | 1) {
    const ids = visible.map((l) => l.to);
    const target = index + dir;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    // Keep any saved ids that aren't currently visible (e.g. tabs another admin can see) at the end.
    const others = order.filter((id) => !ids.includes(id));
    const next = [...ids, ...others];
    setOrder(next);
    saveOrder(next);
  }

  function reset() {
    setOrder([]);
    saveOrder([]);
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-1">
        <h1 className="text-lg font-bold text-orange-600">Admin Panel</h1>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setEditing(!editing)}
            className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
          >
            {editing ? "Done" : "Edit order"}
          </button>
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              aria-label="Hide menu"
              title="Hide menu"
              className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {editing && (
        <p className="mb-2 flex items-center justify-between text-xs text-slate-400">
          <span>Use the arrows to reorder.</span>
          <button type="button" onClick={reset} className="font-semibold text-orange-600 hover:underline">
            Reset
          </button>
        </p>
      )}
      <nav className="flex flex-col gap-1">
        {visible.map((link, index) =>
          editing ? (
            <div
              key={link.to}
              className="flex min-h-[44px] items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-700"
            >
              <span className="min-w-0 flex-1 truncate">{link.label}</span>
              <ArrowButton dir="up" disabled={index === 0} onClick={() => move(index, -1)} />
              <ArrowButton dir="down" disabled={index === visible.length - 1} onClick={() => move(index, 1)} />
            </div>
          ) : (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex min-h-[44px] items-center rounded-md px-3 py-2 text-sm ${
                  isActive ? "bg-orange-50 text-orange-700" : "text-slate-600 hover:bg-slate-100"
                }`
              }
            >
              {link.label}
            </NavLink>
          )
        )}
      </nav>
      <Button variant="secondary" className="mt-6 w-full" onClick={onLogout}>
        Logout
      </Button>
    </>
  );
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [order, setOrder] = useState<string[]>(loadOrder);
  const [editing, setEditing] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(loadCollapsed);

  function toggleCollapsed(v: boolean) {
    setCollapsed(v);
    saveCollapsed(v);
  }

  useEffect(() => {
    activateStoredAuth("admin");
  }, []);

  function logout() {
    clearStoredToken("admin");
    setActiveAuth(null);
    navigate("/admin/login", { replace: true });
  }

  return (
    <AdminProfileProvider>
      <div className="flex min-h-screen bg-slate-50">
        <aside
          className={`w-60 shrink-0 border-r border-slate-200 bg-white p-4 ${collapsed ? "hidden" : "hidden lg:block"}`}
        >
          <SidebarContent
            onLogout={logout}
            order={order}
            setOrder={setOrder}
            editing={editing}
            setEditing={setEditing}
            onCollapse={() => toggleCollapsed(true)}
          />
        </aside>

        {menuOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              type="button"
              aria-label="Close menu"
              className="absolute inset-0 bg-slate-900/40"
              onClick={() => setMenuOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto bg-white p-4 shadow-xl">
              <SidebarContent
                onLogout={logout}
                onNavigate={() => setMenuOpen(false)}
                order={order}
                setOrder={setOrder}
                editing={editing}
                setEditing={setEditing}
              />
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-3 py-2 sm:px-6">
            <button
              type="button"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 lg:hidden"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
              </svg>
            </button>
            {collapsed && (
              <button
                type="button"
                aria-label="Show menu"
                title="Show menu"
                onClick={() => toggleCollapsed(false)}
                className="hidden h-11 w-11 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 lg:inline-flex"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
                </svg>
              </button>
            )}
            <span className="font-semibold text-orange-600 lg:hidden">Admin</span>
            {collapsed && <span className="hidden font-semibold text-orange-600 lg:inline">Admin Panel</span>}
            <div className="ml-auto flex items-center gap-1">
              <ActiveOrders />
              <NotificationCenter />
            </div>
          </header>
          <main className="min-w-0 flex-1 p-3 sm:p-4 lg:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </AdminProfileProvider>
  );
}
