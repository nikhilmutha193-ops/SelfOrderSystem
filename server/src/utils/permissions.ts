/** Admin modules that can be granted individually. Keys are stored on Admin.permissions. */
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
} as const;

export type ModuleKey = keyof typeof MODULES;

export const MODULE_KEYS = Object.keys(MODULES) as ModuleKey[];

/** "view" is read-only; "edit" also allows mutations. A missing entry means no access. */
export type PermissionLevel = "view" | "edit";

export const PERMISSION_LEVELS: PermissionLevel[] = ["view", "edit"];

export function isModuleKey(value: unknown): value is ModuleKey {
  return typeof value === "string" && (MODULE_KEYS as string[]).includes(value);
}

export function isPermissionLevel(value: unknown): value is PermissionLevel {
  return value === "view" || value === "edit";
}

/** Normalizes an untrusted permissions object, dropping unknown modules and levels. */
export function sanitizePermissions(input: unknown): Record<string, PermissionLevel> {
  const result: Record<string, PermissionLevel> = {};
  if (!input || typeof input !== "object") return result;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (isModuleKey(key) && isPermissionLevel(value)) result[key] = value;
  }
  return result;
}
