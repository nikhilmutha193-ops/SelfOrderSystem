import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { activateStoredAuth, clearStoredToken, setActiveAuth } from "../../lib/apiClient";
import { Button } from "../../components/ui";
import NotificationCenter from "../../components/NotificationCenter";
import { AdminProfileProvider, can, useAdmin, type ModuleKey } from "../../lib/adminAuth";

/** `module: null` means always visible (self-service). */
const links: { to: string; label: string; module: ModuleKey | null }[] = [
  { to: "/admin/dashboard", label: "Dashboard", module: "dashboard" },
  { to: "/admin/categories", label: "Categories", module: "categories" },
  { to: "/admin/subcategories", label: "Subcategories", module: "subcategories" },
  { to: "/admin/food-items", label: "Food Items", module: "foodItems" },
  { to: "/admin/tables", label: "Tables", module: "tables" },
  { to: "/admin/qr-codes", label: "QR Codes", module: "tables" },
  { to: "/admin/kot", label: "Kitchen Queue", module: "kot" },
  { to: "/admin/messages", label: "Messages", module: "messages" },
  { to: "/admin/chefs", label: "Chefs", module: "chefs" },
  { to: "/admin/orders?type=dine-in", label: "Dine-in Orders", module: "orders" },
  { to: "/admin/orders?type=delivery", label: "Delivery Orders", module: "orders" },
  { to: "/admin/delivery/new", label: "New Delivery Order", module: "orders" },
  { to: "/admin/team", label: "Team", module: "team" },
  { to: "/admin/awards", label: "Awards", module: "awards" },
  { to: "/admin/coupons", label: "Coupons", module: "coupons" },
  { to: "/admin/reviews", label: "Reviews", module: "reviews" },
  { to: "/admin/settings", label: "Restaurant Settings", module: "settings" },
  { to: "/admin/backup", label: "Backup & Restore", module: "backup" },
  { to: "/admin/admins", label: "Admin Users", module: "admins" },
  { to: "/admin/change-password", label: "Change Password", module: null },
];

function SidebarContent({ onLogout, onNavigate }: { onLogout: () => void; onNavigate?: () => void }) {
  const { profile } = useAdmin();
  const visible = links.filter((link) => link.module === null || can(profile, link.module));

  return (
    <>
      <h1 className="mb-6 text-lg font-bold text-orange-600">Admin Panel</h1>
      <nav className="flex flex-col gap-1">
        {visible.map((link) => (
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
        ))}
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
        <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white p-4 lg:block">
          <SidebarContent onLogout={logout} />
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
              <SidebarContent onLogout={logout} onNavigate={() => setMenuOpen(false)} />
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
            <span className="font-semibold text-orange-600 lg:hidden">Admin</span>
            <div className="ml-auto">
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
