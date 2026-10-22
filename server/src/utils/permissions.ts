export type ModuleKey = keyof typeof MODULES;

export type PermissionLevel = "view" | "edit";

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
  dayClose: "Shifts & Day Close",
  printing: "Printers & Stations",
  inventory: "Inventory",
  customers: "Customers & Loyalty",
  bookings: "Table Bookings",
  pos: "POS Billing",
  captain: "Captain App",
  invoices: "Invoices",
  qrCodes: "QR Codes",
  banners: "Offer Banners",
  gst: "GST & Tax",
} as const;

/**
 * Pages that used to be covered by another module. Logins saved before these existed (modulesVersion
 * below 2) get the parent's level for them, so nobody loses a page; saving a login's access from the
 * Admin Users page makes every level explicit. These keys only decide which pages are shown: the
 * data behind them is still protected by the parent module's own checks.
 */
export const MODULE_PARENT: Partial<Record<ModuleKey, ModuleKey>> = {
  pos: "orders",
  captain: "orders",
  invoices: "orders",
  qrCodes: "tables",
  banners: "landing",
};

export const CURRENT_MODULES_VERSION = 2;

export function effectivePermissions(admin: {
  permissions?: Map<string, PermissionLevel>;
  modulesVersion?: number;
}): Record<string, PermissionLevel> {
  const result: Record<string, PermissionLevel> = Object.fromEntries(admin.permissions ?? []);
  if ((admin.modulesVersion ?? 1) < CURRENT_MODULES_VERSION) {
    for (const [child, parent] of Object.entries(MODULE_PARENT)) {
      if (!result[child] && result[parent as string]) result[child] = result[parent as string];
    }
  }
  return result;
}

export const MODULE_KEYS = Object.keys(MODULES) as ModuleKey[];

export const PERMISSION_LEVELS: PermissionLevel[] = ["view", "edit"];

export function isModuleKey(value: unknown): value is ModuleKey {
  return typeof value === "string" && (MODULE_KEYS as string[]).includes(value);
}

export function isPermissionLevel(value: unknown): value is PermissionLevel {
  return value === "view" || value === "edit";
}

export function sanitizePermissions(input: unknown): Record<string, PermissionLevel> {
  const result: Record<string, PermissionLevel> = {};
  if (!input || typeof input !== "object") return result;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (isModuleKey(key) && isPermissionLevel(value)) result[key] = value;
  }
  return result;
}
