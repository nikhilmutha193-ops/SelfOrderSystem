import type { InvoiceSettings, KotSettings, PrintFontSize } from "../../lib/types";

/**
 * Which details a printed ticket or invoice shows and how big each part is, per paper. This mirrors
 * server/src/utils/printLayout.ts (the server prints with it), so keep the keys in step.
 */
export type PaperKey = "p58" | "p80" | "page";
export type TextSize = "small" | "normal" | "medium" | "large";

export interface SavedLayout {
  show?: Record<string, boolean>;
  fonts?: Record<string, TextSize>;
}
export type PrintLayouts = Partial<Record<PaperKey, SavedLayout>>;

export const PAPERS: { value: PaperKey; label: string }[] = [
  { value: "p58", label: "58 mm roll" },
  { value: "p80", label: "80 mm roll" },
  { value: "page", label: "A5 / A4 page" },
];

export const TEXT_SIZE_OPTIONS: { value: TextSize; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "normal", label: "Normal" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

export interface LayoutField {
  key: string;
  label: string;
}

export const KOT_SHOW: LayoutField[] = [
  { key: "logo", label: "Logo" },
  { key: "restaurantName", label: "Restaurant name" },
  { key: "header", label: "Header text (for example Kitchen Order Ticket)" },
  { key: "token", label: "Token number" },
  { key: "station", label: "Station and category names" },
  { key: "orderInfo", label: "Order type and table" },
  { key: "customerName", label: "Customer name" },
  { key: "dateTime", label: "Date and time" },
  { key: "notes", label: "Dish notes and customisations" },
  { key: "tags", label: "Jain and Pack tags" },
  { key: "comboParts", label: "Combo contents" },
  { key: "prices", label: "Item prices" },
  { key: "itemCount", label: "Item count" },
  { key: "footer", label: "Footer note" },
];
export const KOT_FONTS: LayoutField[] = [
  { key: "name", label: "Restaurant name" },
  { key: "subtext", label: "Text under the name" },
  { key: "header", label: "Header and station" },
  { key: "token", label: "Token number" },
  { key: "orderInfo", label: "Order, table and customer" },
  { key: "items", label: "Dish names" },
  { key: "notes", label: "Notes and combo contents" },
  { key: "footer", label: "Footer note" },
];

export const INVOICE_SHOW: LayoutField[] = [
  { key: "logo", label: "Logo" },
  { key: "restaurantName", label: "Restaurant name" },
  { key: "address", label: "Address" },
  { key: "gstin", label: "GSTIN" },
  { key: "fssai", label: "FSSAI number" },
  { key: "token", label: "Token (cafe flow)" },
  { key: "invoiceNumber", label: "Invoice number" },
  { key: "dateTime", label: "Date and time" },
  { key: "orderType", label: "Order type" },
  { key: "customerName", label: "Customer name" },
  { key: "customerPhone", label: "Customer phone number" },
  { key: "customerGstin", label: "Customer GSTIN" },
  { key: "placeOfSupply", label: "Place of supply" },
  { key: "sac", label: "SAC code" },
  { key: "unitPrice", label: "Unit price" },
  { key: "tags", label: "Jain tag" },
  { key: "discounts", label: "Discounts" },
  { key: "charges", label: "Service, packaging and extra charges" },
  { key: "taxBreakdown", label: "Taxable value and GST lines" },
  { key: "roundOff", label: "Round off" },
  { key: "payments", label: "Payment lines" },
  { key: "upiQr", label: "UPI QR code" },
  { key: "terms", label: "Terms and notes" },
  { key: "footer", label: "Footer note" },
];
export const INVOICE_FONTS: LayoutField[] = [
  { key: "name", label: "Restaurant name" },
  { key: "subtext", label: "Text under the name" },
  { key: "header", label: "Address, GSTIN and title" },
  { key: "details", label: "Invoice and customer details" },
  { key: "items", label: "Dishes" },
  { key: "totals", label: "Charges and tax" },
  { key: "grandTotal", label: "Grand total" },
  { key: "footer", label: "Terms and footer" },
];

const BASE_SIZE: Record<PrintFontSize, TextSize> = { compact: "small", normal: "normal", large: "large" };

export interface ResolvedLayout {
  show: Record<string, boolean>;
  fonts: Record<string, TextSize>;
}

function applySaved(layout: ResolvedLayout, saved: SavedLayout | undefined): ResolvedLayout {
  return {
    show: { ...layout.show, ...saved?.show },
    fonts: { ...layout.fonts, ...saved?.fonts },
  };
}

export function resolveKot(settings: KotSettings, paper: PaperKey): ResolvedLayout {
  const base = BASE_SIZE[settings.fontSize] ?? "normal";
  const saved = settings.layouts?.[paper];
  // Before the restaurant name had its own switch, turning the header off hid both.
  const legacyHidden = saved?.show?.header === false && saved.show.restaurantName === undefined;
  return applySaved(
    {
      show: {
        logo: !!settings.showLogo,
        restaurantName: true,
        header: true,
        token: true,
        station: true,
        orderInfo: settings.showTableInfo !== false,
        customerName: settings.showCustomerName !== false,
        dateTime: true,
        notes: true,
        tags: settings.showJainTag !== false,
        comboParts: true,
        prices: !!settings.showPrices,
        itemCount: true,
        footer: true,
      },
      fonts: { name: base, subtext: "normal", header: base, token: "large", orderInfo: base, items: base, notes: base, footer: base },
    },
    legacyHidden ? { ...saved, show: { ...saved?.show, restaurantName: false } } : saved,
  );
}

export function resolveInvoice(settings: InvoiceSettings, paper: PaperKey): ResolvedLayout {
  const base = BASE_SIZE[settings.fontSize] ?? "normal";
  return applySaved(
    {
      show: {
        logo: !!settings.showLogo,
        restaurantName: true,
        address: true,
        gstin: true,
        fssai: true,
        token: true,
        invoiceNumber: true,
        dateTime: true,
        orderType: true,
        customerName: true,
        customerPhone: settings.showCustomerPhone !== false,
        customerGstin: true,
        placeOfSupply: true,
        sac: true,
        unitPrice: settings.showUnitPrice !== false,
        tags: settings.showJainTag !== false,
        discounts: true,
        charges: true,
        taxBreakdown: true,
        roundOff: true,
        payments: true,
        upiQr: true,
        terms: true,
        footer: true,
      },
      fonts: {
        name: base === "small" ? "normal" : "large",
        subtext: "normal",
        header: base,
        details: base,
        items: base,
        totals: base,
        grandTotal: base,
        footer: base,
      },
    },
    settings.layouts?.[paper],
  );
}
