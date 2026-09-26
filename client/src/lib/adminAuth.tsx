import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { activateStoredAuth, api } from "../shared/api/client";

export type ModuleKey = keyof typeof MODULES;

export type PermissionLevel = "view" | "edit";

export interface AdminProfile {
  id: string;
  username: string;
  isOwner: boolean;
  permissions: Partial<Record<ModuleKey, PermissionLevel>>;
}

export const MODULES = {
  dashboard: "Dashboard",
  categories: "Categories",
  subcategories: "Subcategories",
  foodItems: "Food Items",
  tables: "Tables & QR Codes",
  kot: "Kitchen Queue",
  messages: "Messages",
  chefs: "Chefs",
  orders: "Orders",
  team: "Team",
  awards: "Awards",
  coupons: "Coupons",
  reviews: "Reviews",
  settings: "Restaurant Settings",
  landing: "Landing Page",
  backup: "Backup & Restore",
  admins: "Admin Users",
  analytics: "Analytics",
  audit: "Audit Log",
} as const;

export const MODULE_KEYS = Object.keys(MODULES) as ModuleKey[];

const AdminContext = createContext<{ profile: AdminProfile | null; loading: boolean }>({
  profile: null,
  loading: true,
});

export function AdminProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    activateStoredAuth("admin");
    api
      .get<AdminProfile>("/auth/admin/me")
      .then((res) => setProfile(res.data))
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, []);

  return <AdminContext.Provider value={{ profile, loading }}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  return useContext(AdminContext);
}

export function can(profile: AdminProfile | null, module: ModuleKey, level: PermissionLevel = "view"): boolean {
  if (!profile) return false;
  if (profile.isOwner) return true;
  const granted = profile.permissions?.[module];
  if (!granted) return false;
  return level === "view" ? true : granted === "edit";
}

export function useCanEdit(module: ModuleKey): boolean {
  const { profile } = useAdmin();
  return can(profile, module, "edit");
}

const HOME_ROUTES: { module: ModuleKey; to: string }[] = [
  { module: "dashboard", to: "/admin/dashboard" },
  { module: "orders", to: "/admin/orders?type=dine-in" },
  { module: "kot", to: "/admin/kot" },
  { module: "messages", to: "/admin/messages" },
  { module: "foodItems", to: "/admin/food-items" },
  { module: "tables", to: "/admin/tables" },
  { module: "categories", to: "/admin/categories" },
  { module: "subcategories", to: "/admin/subcategories" },
  { module: "chefs", to: "/admin/chefs" },
  { module: "team", to: "/admin/team" },
  { module: "awards", to: "/admin/awards" },
  { module: "coupons", to: "/admin/coupons" },
  { module: "reviews", to: "/admin/reviews" },
  { module: "settings", to: "/admin/settings" },
  { module: "landing", to: "/admin/landing" },
  { module: "backup", to: "/admin/backup" },
  { module: "admins", to: "/admin/admins" },
];

export function AdminHomeRedirect() {
  const { profile, loading } = useAdmin();
  if (loading) return null;
  const first = HOME_ROUTES.find((route) => can(profile, route.module));
  return <Navigate to={first ? first.to : "/admin/change-password"} replace />;
}

export function RequireModule({ module, children }: { module: ModuleKey; children: ReactNode }) {
  const { profile, loading } = useAdmin();
  if (loading) return null;
  if (!can(profile, module)) return <Navigate to="/admin/no-access" replace />;
  return <>{children}</>;
}
