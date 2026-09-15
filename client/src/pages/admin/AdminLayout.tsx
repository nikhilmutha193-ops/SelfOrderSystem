import { useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { activateStoredAuth, clearStoredToken, setActiveAuth } from "../../lib/apiClient";
import { Button } from "../../components/ui";
import NotificationCenter from "../../components/NotificationCenter";

const links = [
  { to: "/admin/dashboard", label: "Dashboard" },
  { to: "/admin/categories", label: "Categories" },
  { to: "/admin/subcategories", label: "Subcategories" },
  { to: "/admin/food-items", label: "Food Items" },
  { to: "/admin/tables", label: "Tables" },
  { to: "/admin/qr-codes", label: "QR Codes" },
  { to: "/admin/kot", label: "Kitchen Queue" },
  { to: "/admin/messages", label: "Messages" },
  { to: "/admin/chefs", label: "Chefs" },
  { to: "/admin/orders?type=dine-in", label: "Dine-in Orders" },
  { to: "/admin/orders?type=delivery", label: "Delivery Orders" },
  { to: "/admin/delivery/new", label: "New Delivery Order" },
  { to: "/admin/team", label: "Team" },
  { to: "/admin/awards", label: "Awards" },
  { to: "/admin/coupons", label: "Coupons" },
  { to: "/admin/reviews", label: "Reviews" },
  { to: "/admin/settings", label: "Restaurant Settings" },
  { to: "/admin/backup", label: "Backup & Restore" },
  { to: "/admin/change-password", label: "Change Password" },
];

export default function AdminLayout() {
  const navigate = useNavigate();

  useEffect(() => {
    activateStoredAuth("admin");
  }, []);

  function logout() {
    clearStoredToken("admin");
    setActiveAuth(null);
    navigate("/admin/login", { replace: true });
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-60 shrink-0 border-r border-slate-200 bg-white p-4">
        <h1 className="mb-6 text-lg font-bold text-orange-600">Admin Panel</h1>
        <nav className="flex flex-col gap-1">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm ${isActive ? "bg-orange-50 text-orange-700" : "text-slate-600 hover:bg-slate-100"}`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <Button variant="secondary" className="mt-6 w-full" onClick={logout}>
          Logout
        </Button>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end border-b border-slate-200 bg-white px-6 py-2">
          <NotificationCenter />
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
