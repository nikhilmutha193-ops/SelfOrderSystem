import { IOrder, IPayment } from "../../models/Order";
import { IOrderItem } from "../../models/OrderItem";
import { IRestaurant } from "../../models/Restaurant";
import { charsPerLine, EscPos } from "../../utils/escpos";
import { InvoiceTotals } from "../../utils/invoice";
import { billPhone } from "../../utils/phone";
import { paperKeyFor, resolveInvoiceLayout, resolveKotLayout, TextSize } from "../../utils/printLayout";

const PAYMENT_NAMES: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  online: "Online",
  wallet: "Wallet",
};

function money(n: number): string {
  return n.toFixed(2);
}

function stamp(date: Date, timeZone: string | undefined): string {
  return date.toLocaleString("en-IN", {
    timeZone: timeZone || "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** A line (or wrapped lines) in one text size, then back to normal. */
function put(p: EscPos, value: string, size: TextSize, bold = false) {
  p.textSize(size).bold(bold).wrapped(value, p.columns(size)).bold(false).textSize("normal");
}

/** The shop name and the grand total stand one step above the text size chosen for their part of the bill. */
function bump(size: TextSize): TextSize {
  return size === "small" ? "normal" : "large";
}

export interface KotTicket {
  restaurant: Pick<IRestaurant, "name" | "timezone" | "kotSettings">;
  orderLabel: string;
  customerName?: string;
  tokenNumber: number | null;
  round: number;
  stationName?: string;
  categoryName?: string;
  items: Pick<IOrderItem, "foodName" | "quantity" | "modifiers" | "note" | "isJain" | "isPacked" | "components">[];
  printedAt: Date;
  paperWidth: 58 | 80;
  reprint?: boolean;
}

export function renderKot(ticket: KotTicket): Buffer {
  const settings = ticket.restaurant.kotSettings;
  const { show, fonts } = resolveKotLayout(settings, paperKeyFor(ticket.paperWidth));
  const p = new EscPos(charsPerLine(ticket.paperWidth));
  p.align("center");
  if (show.restaurantName) put(p, ticket.restaurant.name, fonts.header, true);
  if (show.header) put(p, settings?.headerText || "Kitchen Order Ticket", fonts.header, true);
  if (ticket.reprint) p.line("*** REPRINT ***");
  if (show.token && ticket.tokenNumber != null) put(p, `TOKEN ${ticket.tokenNumber}`, fonts.token, true);
  if (show.station && ticket.stationName) put(p, ticket.stationName.toUpperCase(), fonts.header, true);
  if (show.station && ticket.categoryName) put(p, ticket.categoryName.toUpperCase(), fonts.header, true);
  p.align("left").divider();
  if (show.orderInfo) put(p, ticket.orderLabel, fonts.orderInfo, true);
  if (show.customerName && ticket.customerName) put(p, `Guest: ${ticket.customerName}`, fonts.orderInfo);
  if (show.dateTime) p.row(`Round ${ticket.round}`, stamp(ticket.printedAt, ticket.restaurant.timezone));
  else p.line(`Round ${ticket.round}`);
  p.divider();

  for (const item of ticket.items) {
    const jain = show.tags && item.isJain ? " (JAIN)" : "";
    const pack = show.tags && item.isPacked ? " (PACK)" : "";
    put(p, `${item.quantity} x ${item.foodName}${jain}${pack}`, fonts.items, true);
    const extras = [...(item.modifiers ?? []).map((m) => m.label), item.note].filter(Boolean);
    if (show.notes && extras.length) put(p, `   > ${extras.join(", ")}`, fonts.notes);
    if (show.comboParts) {
      for (const part of item.components ?? []) put(p, `   - ${part.quantity * item.quantity} x ${part.name}`, fonts.notes);
    }
  }

  p.divider();
  const count = ticket.items.reduce((sum, i) => sum + i.quantity, 0);
  if (show.itemCount) p.line(`${count} item${count === 1 ? "" : "s"}`);
  if (show.footer && settings?.footerNote) {
    p.align("center");
    put(p, settings.footerNote, fonts.footer);
    p.align("left");
  }
  return p.cut().toBuffer();
}

export interface BillTicket {
  restaurant: Pick<
    IRestaurant,
    "name" | "address" | "gstin" | "fssaiLicense" | "timezone" | "invoiceSettings" | "billingSettings"
  >;
  order: Pick<
    IOrder,
    | "invoiceNumber"
    | "billedAt"
    | "checkinTime"
    | "customerName"
    | "customerPhone"
    | "customerGstin"
    | "orderType"
    | "status"
    | "couponCode"
    | "manualDiscount"
  > & { payments?: IPayment[] };
  orderLabel: string;
  items: (Pick<IOrderItem, "foodName" | "quantity" | "total" | "status" | "complimentary"> &
    Partial<Pick<IOrderItem, "unitPrice" | "isJain">>)[];
  /** Cafe flow: the token the guest collects the order by, printed large under the invoice number. */
  tokenText?: string;
  totals: InvoiceTotals;
  upiLink?: string | null;
  paperWidth: 58 | 80;
  openDrawer?: boolean;
}

export function renderBill(ticket: BillTicket): Buffer {
  const { restaurant, order, totals } = ticket;
  const { show, fonts } = resolveInvoiceLayout(restaurant.invoiceSettings, paperKeyFor(ticket.paperWidth));
  const p = new EscPos(charsPerLine(ticket.paperWidth));
  p.align("center");
  if (show.restaurantName) put(p, restaurant.name, bump(fonts.header), true);
  if (show.address && restaurant.address) put(p, restaurant.address, fonts.header);
  if (show.gstin && restaurant.gstin) put(p, `GSTIN: ${restaurant.gstin}`, fonts.header);
  if (show.fssai && restaurant.fssaiLicense) put(p, `FSSAI: ${restaurant.fssaiLicense}`, fonts.header);
  put(p, order.invoiceNumber ? "TAX INVOICE" : "BILL PREVIEW", fonts.header, true);
  if (show.token && ticket.tokenText) put(p, ticket.tokenText.toUpperCase(), bump(fonts.header), true);
  p.align("left").divider();

  const d = fonts.details;
  if (show.invoiceNumber && order.invoiceNumber) put(p, `Invoice: ${order.invoiceNumber}`, d);
  if (show.dateTime) put(p, `Date: ${stamp(order.billedAt ?? order.checkinTime, restaurant.timezone)}`, d);
  if (show.orderType) put(p, ticket.orderLabel, d);
  if (show.customerName) {
    const phone =
      show.customerPhone && order.customerPhone ? ` (${billPhone(order.customerPhone, restaurant.invoiceSettings)})` : "";
    put(p, `Guest: ${order.customerName}${phone}`, d);
  } else if (show.customerPhone && order.customerPhone) {
    put(p, `Phone: ${billPhone(order.customerPhone, restaurant.invoiceSettings)}`, d);
  }
  if (show.customerGstin && order.customerGstin) put(p, `Guest GSTIN: ${order.customerGstin}`, d);
  p.divider();

  const itemCols = p.columns(fonts.items);
  p.textSize(fonts.items);
  for (const item of ticket.items.filter((i) => i.status !== "cancelled")) {
    const tag = show.tags && item.isJain ? " (Jain)" : "";
    const price = show.unitPrice && item.unitPrice != null ? ` @${money(item.unitPrice)}` : "";
    const label = `${item.quantity} x ${item.foodName}${tag}${price}${item.complimentary ? " (free)" : ""}`;
    p.row(label, money(item.total), itemCols);
  }
  p.textSize("normal").divider();

  const cols = p.columns(fonts.totals);
  p.textSize(fonts.totals);
  p.row("Subtotal", money(totals.subtotal), cols);
  if (show.discounts) {
    if ((totals.couponDiscount ?? 0) > 0)
      p.row(`Coupon ${order.couponCode ?? ""}`.trim(), `-${money(totals.couponDiscount)}`, cols);
    if ((totals.manualDiscount ?? 0) > 0) p.row("Discount", `-${money(totals.manualDiscount)}`, cols);
    if ((totals.loyaltyDiscount ?? 0) > 0) p.row("Loyalty points", `-${money(totals.loyaltyDiscount)}`, cols);
  }
  if (show.charges) {
    if ((totals.serviceCharge ?? 0) > 0)
      p.row(`Service charge ${totals.serviceChargePercent}%`, money(totals.serviceCharge), cols);
    if ((totals.packagingCharge ?? 0) > 0) p.row("Packaging", money(totals.packagingCharge), cols);
    for (const extra of totals.extraCharges ?? []) p.row(extra.name, money(extra.amount), cols);
  }
  if (show.taxBreakdown) {
    p.row("Taxable value", money(totals.taxableAmount), cols);
    for (const tax of totals.taxLines) p.row(`${tax.name} ${tax.percent}%`, money(tax.amount), cols);
  }
  if (show.roundOff && totals.roundOff !== 0)
    p.row("Round off", `${totals.roundOff > 0 ? "+" : ""}${money(totals.roundOff)}`, cols);
  p.textSize("normal");

  const total = bump(fonts.grandTotal);
  p.textSize(total).bold(true).row("TOTAL", `Rs.${money(totals.grandTotal)}`, p.columns(total)).bold(false).textSize("normal");

  if (show.payments) {
    p.textSize(fonts.totals);
    for (const payment of order.payments ?? []) {
      p.row(`Paid by ${PAYMENT_NAMES[payment.method] ?? payment.method}`, money(payment.amount), cols);
      if (payment.change) p.row("Change", money(payment.change), cols);
    }
    p.textSize("normal");
  }

  if (show.upiQr && ticket.upiLink && order.status === "billed") {
    p.divider().align("center").line("Scan to pay with any UPI app").qr(ticket.upiLink).align("left");
  }

  const terms = restaurant.invoiceSettings?.termsText;
  if (show.terms && terms) {
    p.divider();
    put(p, terms, fonts.footer);
  }
  const footer = restaurant.invoiceSettings?.footerNote;
  if (show.footer && footer) {
    p.divider().align("center");
    put(p, footer, fonts.footer);
    p.align("left");
  }
  if (ticket.openDrawer) p.openDrawer();
  return p.cut().toBuffer();
}

export function renderTestPage(printerName: string, paperWidth: 58 | 80): Buffer {
  const p = new EscPos(charsPerLine(paperWidth));
  p.align("center").bold(true).size(true).line("TEST PRINT").size(false).bold(false);
  p.line(printerName)
    .line(new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))
    .divider();
  p.align("left").line("If you can read this, SelfOrder can").line("print to this printer.");
  return p.cut().toBuffer();
}
