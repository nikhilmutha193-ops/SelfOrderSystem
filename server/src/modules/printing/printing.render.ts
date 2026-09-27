import { IOrder, IPayment } from "../../models/Order";
import { IOrderItem } from "../../models/OrderItem";
import { IRestaurant } from "../../models/Restaurant";
import { charsPerLine, EscPos } from "../../utils/escpos";
import { InvoiceTotals } from "../../utils/invoice";

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

export interface KotTicket {
  restaurant: Pick<IRestaurant, "name" | "timezone" | "kotSettings">;
  orderLabel: string;
  customerName?: string;
  tokenNumber: number | null;
  round: number;
  stationName?: string;
  items: Pick<IOrderItem, "foodName" | "quantity" | "modifiers" | "note" | "isJain">[];
  printedAt: Date;
  paperWidth: 58 | 80;
  reprint?: boolean;
}

export function renderKot(ticket: KotTicket): Buffer {
  const settings = ticket.restaurant.kotSettings;
  const p = new EscPos(charsPerLine(ticket.paperWidth));
  p.align("center")
    .bold(true)
    .line(settings?.headerText || "Kitchen Order Ticket")
    .bold(false);
  if (ticket.reprint) p.line("*** REPRINT ***");
  if (ticket.tokenNumber != null) p.size(true).bold(true).line(`TOKEN ${ticket.tokenNumber}`).size(false).bold(false);
  if (ticket.stationName) p.bold(true).line(ticket.stationName.toUpperCase()).bold(false);
  p.align("left").divider();
  if (settings?.showTableInfo !== false) p.bold(true).line(ticket.orderLabel).bold(false);
  if (settings?.showCustomerName !== false && ticket.customerName) p.line(`Guest: ${ticket.customerName}`);
  p.row(`Round ${ticket.round}`, stamp(ticket.printedAt, ticket.restaurant.timezone)).divider();

  for (const item of ticket.items) {
    const jain = settings?.showJainTag !== false && item.isJain ? " (JAIN)" : "";
    p.size(false).bold(true).wrapped(`${item.quantity} x ${item.foodName}${jain}`).bold(false);
    const extras = [...(item.modifiers ?? []).map((m) => m.label), item.note].filter(Boolean);
    if (extras.length) p.wrapped(`   > ${extras.join(", ")}`);
  }

  p.divider();
  const count = ticket.items.reduce((sum, i) => sum + i.quantity, 0);
  p.line(`${count} item${count === 1 ? "" : "s"}`);
  if (settings?.footerNote) p.align("center").wrapped(settings.footerNote).align("left");
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
    | "customerGstin"
    | "orderType"
    | "status"
    | "couponCode"
    | "manualDiscount"
  > & { payments?: IPayment[] };
  orderLabel: string;
  items: Pick<IOrderItem, "foodName" | "quantity" | "total" | "status" | "complimentary">[];
  totals: InvoiceTotals;
  upiLink?: string | null;
  paperWidth: 58 | 80;
  openDrawer?: boolean;
}

export function renderBill(ticket: BillTicket): Buffer {
  const { restaurant, order, totals } = ticket;
  const p = new EscPos(charsPerLine(ticket.paperWidth));
  p.align("center")
    .bold(true)
    .size(true)
    .wrapped(restaurant.name, Math.floor(p.width / 2))
    .size(false)
    .bold(false);
  if (restaurant.address) p.wrapped(restaurant.address);
  if (restaurant.gstin) p.line(`GSTIN: ${restaurant.gstin}`);
  if (restaurant.fssaiLicense) p.line(`FSSAI: ${restaurant.fssaiLicense}`);
  p.bold(true)
    .line(order.invoiceNumber ? "TAX INVOICE" : "BILL PREVIEW")
    .bold(false)
    .align("left")
    .divider();

  if (order.invoiceNumber) p.line(`Invoice: ${order.invoiceNumber}`);
  p.line(`Date: ${stamp(order.billedAt ?? order.checkinTime, restaurant.timezone)}`);
  p.line(ticket.orderLabel);
  p.line(`Guest: ${order.customerName}`);
  if (order.customerGstin) p.line(`Guest GSTIN: ${order.customerGstin}`);
  p.divider();

  for (const item of ticket.items.filter((i) => i.status !== "cancelled")) {
    const label = `${item.quantity} x ${item.foodName}${item.complimentary ? " (free)" : ""}`;
    p.row(label, money(item.total));
  }
  p.divider();
  p.row("Subtotal", money(totals.subtotal));
  if ((totals.couponDiscount ?? 0) > 0)
    p.row(`Coupon ${order.couponCode ?? ""}`.trim(), `-${money(totals.couponDiscount)}`);
  if ((totals.manualDiscount ?? 0) > 0) p.row("Discount", `-${money(totals.manualDiscount)}`);
  if ((totals.loyaltyDiscount ?? 0) > 0) p.row("Loyalty points", `-${money(totals.loyaltyDiscount)}`);
  if ((totals.serviceCharge ?? 0) > 0)
    p.row(`Service charge ${totals.serviceChargePercent}%`, money(totals.serviceCharge));
  p.row("Taxable value", money(totals.taxableAmount));
  for (const tax of totals.taxLines) p.row(`${tax.name} ${tax.percent}%`, money(tax.amount));
  if (totals.roundOff !== 0) p.row("Round off", `${totals.roundOff > 0 ? "+" : ""}${money(totals.roundOff)}`);
  p.bold(true)
    .size(true)
    .row("TOTAL", `Rs.${money(totals.grandTotal)}`)
    .size(false)
    .bold(false);

  for (const payment of order.payments ?? []) {
    p.row(`Paid by ${PAYMENT_NAMES[payment.method] ?? payment.method}`, money(payment.amount));
    if (payment.change) p.row("Change", money(payment.change));
  }

  if (ticket.upiLink && order.status === "billed") {
    p.divider().align("center").line("Scan to pay with any UPI app").qr(ticket.upiLink).align("left");
  }

  const footer = restaurant.invoiceSettings?.footerNote;
  if (footer) p.divider().align("center").wrapped(footer).align("left");
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
