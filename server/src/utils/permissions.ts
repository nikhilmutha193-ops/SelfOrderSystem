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
} as const;

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
