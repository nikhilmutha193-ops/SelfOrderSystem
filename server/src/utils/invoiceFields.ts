import type { IRestaurant } from "../models/Restaurant";

/** The lines at the top of an invoice, in the order the restaurant chose (Settings > Invoice > Name and field order). */
export const HEADER_FIELDS = ["name", "subtext", "address", "gstin", "fssai", "title", "token"] as const;
/** The lines under the header: invoice number, date, order type, customer and the customer's GSTIN. */
export const DETAIL_FIELDS = ["invoiceNumber", "dateTime", "orderType", "customer", "customerGstin"] as const;

export type HeaderField = (typeof HEADER_FIELDS)[number];
export type DetailField = (typeof DETAIL_FIELDS)[number];

/** A saved order, cleaned: known fields once each, in the saved order, and any field it misses at the end. */
export function orderFields<T extends string>(saved: unknown, all: readonly T[]): T[] {
  const known = Array.isArray(saved) ? saved.filter((key): key is T => all.includes(key as T)) : [];
  const unique = [...new Set(known)];
  return [...unique, ...all.filter((key) => !unique.includes(key))];
}

/** The name printed on the invoice: the one written in Invoice settings, else the restaurant's own name. */
export function invoiceDisplayName(restaurant: Pick<IRestaurant, "name" | "invoiceSettings">): string {
  return restaurant.invoiceSettings?.displayName?.trim() || restaurant.name;
}

/** The small line under the name (a tagline, or the rest of a long name); empty when not set. */
export function invoiceSubtext(restaurant: Pick<IRestaurant, "invoiceSettings">): string {
  return restaurant.invoiceSettings?.subText?.trim() || "";
}
