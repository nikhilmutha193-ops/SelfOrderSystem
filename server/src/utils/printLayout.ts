import type { IInvoiceSettings, IKotSettings, PrintFontSize, PrintPaperSize } from "../models/Restaurant";

/**
 * Which details a printed ticket or invoice shows, and how big each part is, per paper:
 * 58 mm and 80 mm thermal rolls each get their own layout, and A5/A4 share the "page" layout.
 * Saved layouts only hold what the owner changed; everything else falls back to the older single
 * settings (showCustomerName, fontSize ...) and then to the defaults here.
 */
export type PaperKey = "p58" | "p80" | "page";
export const PAPER_KEYS: PaperKey[] = ["p58", "p80", "page"];

/** medium sits between normal and large: normal width, double height. */
export type TextSize = "small" | "normal" | "medium" | "large";
export const TEXT_SIZES: TextSize[] = ["small", "normal", "medium", "large"];

export const KOT_SHOW = [
  "logo",
  "restaurantName",
  "header",
  "token",
  "station",
  "orderInfo",
  "customerName",
  "dateTime",
  "notes",
  "tags",
  "comboParts",
  "prices",
  "itemCount",
  "footer",
] as const;
export const KOT_FONTS = ["name", "subtext", "header", "token", "orderInfo", "items", "notes", "footer"] as const;

export const INVOICE_SHOW = [
  "logo",
  "restaurantName",
  "address",
  "gstin",
  "fssai",
  "token",
  "invoiceNumber",
  "dateTime",
  "orderType",
  "customerName",
  "customerPhone",
  "customerGstin",
  "placeOfSupply",
  "sac",
  "unitPrice",
  "tags",
  "discounts",
  "charges",
  "taxBreakdown",
  "roundOff",
  "payments",
  "upiQr",
  "terms",
  "footer",
] as const;
export const INVOICE_FONTS = ["name", "subtext", "header", "details", "items", "totals", "grandTotal", "footer"] as const;

export type KotShowKey = (typeof KOT_SHOW)[number];
export type KotFontKey = (typeof KOT_FONTS)[number];
export type InvoiceShowKey = (typeof INVOICE_SHOW)[number];
export type InvoiceFontKey = (typeof INVOICE_FONTS)[number];

export interface Layout<S extends string, F extends string> {
  show: Record<S, boolean>;
  fonts: Record<F, TextSize>;
}
export type KotLayout = Layout<KotShowKey, KotFontKey>;
export type InvoiceLayout = Layout<InvoiceShowKey, InvoiceFontKey>;

/** What is saved: only the overridden entries. */
export interface SavedLayout {
  show?: Record<string, boolean>;
  fonts?: Record<string, TextSize>;
}
export type SavedLayouts = Partial<Record<PaperKey, SavedLayout>>;

export function paperKeyFor(paper: PrintPaperSize | 58 | 80): PaperKey {
  if (paper === 58 || paper === "thermal58") return "p58";
  if (paper === 80 || paper === "thermal80") return "p80";
  return "page";
}

const BASE_SIZE: Record<PrintFontSize, TextSize> = { compact: "small", normal: "normal", large: "large" };

export function resolveKotLayout(
  settings: Partial<IKotSettings> | null | undefined,
  paper: PaperKey
): KotLayout {
  const base = BASE_SIZE[settings?.fontSize ?? "normal"] ?? "normal";
  const show: Record<KotShowKey, boolean> = {
    logo: !!settings?.showLogo,
    restaurantName: true,
    header: true,
    token: true,
    station: true,
    orderInfo: settings?.showTableInfo !== false,
    customerName: settings?.showCustomerName !== false,
    dateTime: true,
    notes: true,
    tags: settings?.showJainTag !== false,
    comboParts: true,
    prices: !!settings?.showPrices,
    itemCount: true,
    footer: true,
  };
  const fonts: Record<KotFontKey, TextSize> = {
    name: base,
    subtext: "normal",
    header: base,
    token: "large",
    orderInfo: base,
    items: base,
    notes: base,
    footer: base,
  };
  const saved = (settings?.layouts as SavedLayouts | undefined)?.[paper];
  // Before the restaurant name had its own switch, turning the header off hid both.
  if (saved?.show && saved.show.header === false && saved.show.restaurantName === undefined) {
    return merge(show, fonts, { ...saved, show: { ...saved.show, restaurantName: false } });
  }
  return merge(show, fonts, saved);
}

export function resolveInvoiceLayout(
  settings: Partial<IInvoiceSettings> | null | undefined,
  paper: PaperKey
): InvoiceLayout {
  const base = BASE_SIZE[settings?.fontSize ?? "normal"] ?? "normal";
  const show: Record<InvoiceShowKey, boolean> = {
    logo: !!settings?.showLogo,
    restaurantName: true,
    address: true,
    gstin: true,
    fssai: true,
    token: true,
    invoiceNumber: true,
    dateTime: true,
    orderType: true,
    customerName: true,
    customerPhone: settings?.showCustomerPhone !== false,
    customerGstin: true,
    placeOfSupply: true,
    sac: true,
    unitPrice: settings?.showUnitPrice !== false,
    tags: settings?.showJainTag !== false,
    discounts: true,
    charges: true,
    taxBreakdown: true,
    roundOff: true,
    payments: true,
    upiQr: true,
    terms: true,
    footer: true,
  };
  const fonts: Record<InvoiceFontKey, TextSize> = {
    name: base === "small" ? "normal" : "large",
    subtext: "normal",
    header: base,
    details: base,
    items: base,
    totals: base,
    grandTotal: base,
    footer: base,
  };
  return merge(show, fonts, (settings?.layouts as SavedLayouts | undefined)?.[paper]);
}

function merge<S extends string, F extends string>(
  show: Record<S, boolean>,
  fonts: Record<F, TextSize>,
  saved: SavedLayout | undefined
): Layout<S, F> {
  const out = { show: { ...show }, fonts: { ...fonts } };
  for (const key of Object.keys(show) as S[]) {
    const value = saved?.show?.[key];
    if (typeof value === "boolean") out.show[key] = value;
  }
  for (const key of Object.keys(fonts) as F[]) {
    const value = saved?.fonts?.[key];
    if (value && TEXT_SIZES.includes(value)) out.fonts[key] = value;
  }
  return out;
}

/** Keeps only known papers, keys and sizes from what a client sends. */
export function cleanLayouts(input: unknown, showKeys: readonly string[], fontKeys: readonly string[]): SavedLayouts {
  const out: SavedLayouts = {};
  if (!input || typeof input !== "object") return out;
  for (const paper of PAPER_KEYS) {
    const raw = (input as Record<string, unknown>)[paper];
    if (!raw || typeof raw !== "object") continue;
    const layout: SavedLayout = {};
    const show = (raw as SavedLayout).show;
    if (show && typeof show === "object") {
      const kept = Object.fromEntries(
        Object.entries(show).filter(([key, value]) => showKeys.includes(key) && typeof value === "boolean")
      );
      if (Object.keys(kept).length) layout.show = kept;
    }
    const fonts = (raw as SavedLayout).fonts;
    if (fonts && typeof fonts === "object") {
      const kept = Object.fromEntries(
        Object.entries(fonts).filter(([key, value]) => fontKeys.includes(key) && TEXT_SIZES.includes(value as TextSize))
      ) as Record<string, TextSize>;
      if (Object.keys(kept).length) layout.fonts = kept;
    }
    if (layout.show || layout.fonts) out[paper] = layout;
  }
  return out;
}
