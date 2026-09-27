import {
  Armchair,
  Award,
  Boxes,
  CalendarCheck,
  ChartColumn,
  ChefHat,
  ClipboardPlus,
  Contact,
  CookingPot,
  DatabaseBackup,
  Globe,
  Layers,
  LayoutDashboard,
  ListTree,
  MessagesSquare,
  MonitorSmartphone,
  Printer,
  QrCode,
  ReceiptText,
  ScrollText,
  Settings,
  ShoppingBag,
  Smartphone,
  Star,
  Table2,
  TicketPercent,
  UserCog,
  Users,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { can, type AdminProfile, type ModuleKey } from "../lib/adminAuth";

export interface AdminNavItem {
  to: string;
  label: string;
  module: ModuleKey | null;
  icon: LucideIcon;
  keywords?: string;
}

export interface AdminNavGroup {
  label: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        to: "/admin/dashboard",
        label: "Dashboard",
        module: "dashboard",
        icon: LayoutDashboard,
        keywords: "home today",
      },
      { to: "/admin/analytics", label: "Analytics", module: "analytics", icon: ChartColumn, keywords: "sales reports" },
    ],
  },
  {
    label: "Service",
    items: [
      { to: "/pos", label: "POS Billing", module: "orders", icon: MonitorSmartphone, keywords: "counter billing till" },
      { to: "/captain", label: "Captain App", module: "orders", icon: Smartphone, keywords: "waiter" },
      { to: "/admin/orders?type=dine-in", label: "Dine-in Orders", module: "orders", icon: Armchair },
      {
        to: "/admin/orders?type=takeaway",
        label: "Take-away Orders",
        module: "orders",
        icon: ShoppingBag,
        keywords: "parcel",
      },
      { to: "/admin/delivery/new", label: "New Order", module: "orders", icon: ClipboardPlus, keywords: "create" },
      { to: "/admin/kot", label: "Kitchen Queue", module: "kot", icon: CookingPot, keywords: "kot" },
      { to: "/admin/messages", label: "Messages", module: "messages", icon: MessagesSquare, keywords: "chat requests" },
    ],
  },
  {
    label: "Billing & Cash",
    items: [
      { to: "/admin/invoices", label: "Invoices", module: "orders", icon: ReceiptText, keywords: "bills register" },
      { to: "/admin/shifts", label: "Cash Shifts", module: "dayClose", icon: Wallet, keywords: "drawer" },
      { to: "/admin/day-close", label: "Day Close", module: "dayClose", icon: CalendarCheck, keywords: "z report" },
    ],
  },
  {
    label: "Menu",
    items: [
      { to: "/admin/categories", label: "Categories", module: "categories", icon: Layers },
      { to: "/admin/subcategories", label: "Subcategories", module: "subcategories", icon: ListTree },
      { to: "/admin/food-items", label: "Food Items", module: "foodItems", icon: UtensilsCrossed, keywords: "dishes" },
    ],
  },
  {
    label: "Floor",
    items: [
      { to: "/admin/tables", label: "Tables", module: "tables", icon: Table2 },
      { to: "/admin/qr-codes", label: "QR Codes", module: "tables", icon: QrCode },
    ],
  },
  {
    label: "Guests",
    items: [
      { to: "/admin/customers", label: "Customers", module: "customers", icon: Contact, keywords: "loyalty crm" },
      { to: "/admin/coupons", label: "Coupons", module: "coupons", icon: TicketPercent, keywords: "offers discount" },
      { to: "/admin/reviews", label: "Reviews", module: "reviews", icon: Star, keywords: "feedback" },
    ],
  },
  {
    label: "Kitchen & Stock",
    items: [
      { to: "/admin/inventory", label: "Inventory", module: "inventory", icon: Boxes, keywords: "stock recipes" },
      { to: "/admin/chefs", label: "Chefs", module: "chefs", icon: ChefHat },
      { to: "/admin/printing", label: "Printers & Stations", module: "printing", icon: Printer, keywords: "kot" },
    ],
  },
  {
    label: "Website",
    items: [
      { to: "/admin/landing", label: "Landing Page", module: "landing", icon: Globe },
      { to: "/admin/team", label: "Team", module: "team", icon: Users },
      { to: "/admin/awards", label: "Awards", module: "awards", icon: Award },
    ],
  },
  {
    label: "Administration",
    items: [
      { to: "/admin/settings", label: "Restaurant Settings", module: "settings", icon: Settings, keywords: "tax gst" },
      { to: "/admin/admins", label: "Admin Users", module: "admins", icon: UserCog, keywords: "staff permissions" },
      { to: "/admin/backup", label: "Backup & Restore", module: "backup", icon: DatabaseBackup },
      { to: "/admin/audit", label: "Audit Log", module: "audit", icon: ScrollText, keywords: "history" },
    ],
  },
];

export const MOBILE_TABS = ["/admin/dashboard", "/admin/orders?type=dine-in", "/admin/kot", "/admin/messages"];

export const MOBILE_TAB_LABELS: Record<string, string> = {
  "/admin/dashboard": "Home",
  "/admin/orders?type=dine-in": "Orders",
  "/admin/kot": "Kitchen",
  "/admin/messages": "Messages",
};

const EXTRA_TITLES: { prefix: string; group: string; item: AdminNavItem }[] = [
  {
    prefix: "/admin/orders/",
    group: "Service",
    item: { to: "/admin/orders", label: "Order details", module: "orders", icon: ReceiptText },
  },
  {
    prefix: "/admin/orders",
    group: "Service",
    item: { to: "/admin/orders", label: "Orders", module: "orders", icon: ReceiptText },
  },
  {
    prefix: "/admin/change-password",
    group: "Account",
    item: { to: "/admin/change-password", label: "Change password", module: null, icon: UserCog },
  },
];

export function visibleNav(profile: AdminProfile | null): AdminNavGroup[] {
  return ADMIN_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.module === null || can(profile, item.module)),
  })).filter((group) => group.items.length > 0);
}

export function isNavActive(item: AdminNavItem, pathname: string, search: string): boolean {
  const [path, query] = item.to.split("?");
  if (query) {
    if (pathname !== path) return false;
    return new URLSearchParams(search).get("type") === new URLSearchParams(query).get("type");
  }
  if (path === "/admin/orders") return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function findActiveNav(pathname: string, search: string): { group: string; item: AdminNavItem } | null {
  for (const group of ADMIN_NAV) {
    for (const item of group.items) {
      if (isNavActive(item, pathname, search)) return { group: group.label, item };
    }
  }
  const extra = EXTRA_TITLES.find((e) => pathname.startsWith(e.prefix));
  return extra ? { group: extra.group, item: extra.item } : null;
}
