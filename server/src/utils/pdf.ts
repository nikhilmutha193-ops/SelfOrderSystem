import dns from "dns/promises";
import fs from "fs/promises";
import net from "net";
import path from "path";
import { Response } from "express";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";

import { IOrder } from "../models/Order";
import { IOrderItem } from "../models/OrderItem";
import { IRestaurant, PrintPaperSize } from "../models/Restaurant";
import { mergeKotLines } from "./kotLines";
import { InvoiceTotals } from "./invoice";
import { kotTicketKey, kotTicketLabel } from "./kotGroups";
import { DEFAULT_SAC } from "./invoiceNumber";
import { orderTokenText } from "./orderToken";
import { billPhone } from "./phone";
import {
  InvoiceFontKey,
  KotFontKey,
  paperKeyFor,
  resolveInvoiceLayout,
  resolveKotLayout,
  TextSize,
} from "./printLayout";
import { describeError, logger } from "./logger";
import { putObject, UPLOADS_DIR } from "./objectStore";

interface Column {
  text: string;
  width: number;
  align?: "left" | "right" | "center";
}

interface OrdersReportRow {
  customer: string;
  type: string;
  checkin: string;
  status: string;
  payment: string;
  total: number;
}

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

async function isPublicHttpUrl(rawUrl: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  let addresses: string[];
  try {
    const records = await dns.lookup(url.hostname, { all: true, verbatim: true });
    addresses = records.map((r) => r.address);
  } catch {
    return false;
  }
  if (addresses.length === 0) return false;

  return addresses.every((address) => {
    const type = net.isIP(address);
    if (type === 4) return isPublicIPv4(address);
    if (type === 6) return isPublicIPv6(address);
    return false;
  });
}

function isPublicIPv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false;
  const [a, b] = parts;
  if (a === 10) return false;
  if (a === 127) return false;
  if (a === 0) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  return true;
}

function isPublicIPv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::1") return false;
  if (normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd")) return false;
  if (normalized.startsWith("::ffff:")) return isPublicIPv4(normalized.replace("::ffff:", ""));
  return true;
}

const PAPER_WIDTH: Record<PrintPaperSize, number> = {
  thermal58: 164,
  thermal80: 227,
  a5: 420,
  a4: 595,
};

const FIXED_PAPER_HEIGHT: Partial<Record<PrintPaperSize, number>> = {
  a5: 595,
  a4: 842,
};

const THERMAL_MIN_HEIGHT = 80;

const THERMAL_MAX_HEIGHT = 2200;

function isThermal(paperSize: PrintPaperSize): boolean {
  return paperSize === "thermal58" || paperSize === "thermal80";
}

const SIZE_SCALE: Record<TextSize, number> = { small: 0.85, normal: 1, medium: 1.1, large: 1.2 };

async function renderToPaper(
  res: Response,
  filename: string,
  paperSize: PrintPaperSize,
  render: (doc: PDFKit.PDFDocument, x0: number, usableWidth: number) => void | number,
  archive?: (pdf: Buffer) => Promise<void>
): Promise<void> {
  const width = PAPER_WIDTH[paperSize];
  // A thermal roll prints edge to edge apart from the printer's own unprintable strip, so its margins are kept
  // small; a page (A5, A4) keeps the usual margin.
  const margins = isThermal(paperSize)
    ? { top: 6, bottom: 6, left: 8, right: 8 }
    : { top: 30, bottom: 30, left: 30, right: 30 };
  const usableWidth = width - margins.left - margins.right;

  let height = FIXED_PAPER_HEIGHT[paperSize];
  if (height === undefined) {
    const measureDoc = new PDFDocument({ size: [width, THERMAL_MAX_HEIGHT], margins, bufferPages: true });
    // A render over several pages (one ticket each) reports its tallest page; otherwise the last position counts.
    const tallest = render(measureDoc, margins.left, usableWidth);
    const used = typeof tallest === "number" ? tallest : measureDoc.y;
    height = Math.min(THERMAL_MAX_HEIGHT, Math.max(THERMAL_MIN_HEIGHT, Math.ceil(used + margins.bottom)));
  }

  const pdf = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: [width, height], margins });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    render(doc, margins.left, usableWidth);
    doc.end();
  });

  if (archive) {
    try {
      await archive(pdf);
    } catch (err) {
      logger.error("pdf: archive failed", { filename, ...describeError(err) }); // a storage outage shouldn't block printing
    }
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.end(pdf);
}

export async function resolveLogoBuffer(logoUrl?: string): Promise<Buffer | null> {
  if (!logoUrl) return null;
  try {
    if (logoUrl.startsWith("/uploads/")) {
      const filePath = path.join(UPLOADS_DIR, logoUrl.replace(/^\/uploads\//, ""));
      if (path.relative(UPLOADS_DIR, filePath).startsWith("..")) return null;
      return await fs.readFile(filePath);
    }
    if (/^https?:\/\//i.test(logoUrl)) {
      if (!(await isPublicHttpUrl(logoUrl))) return null;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(logoUrl, { signal: controller.signal, redirect: "error" });
        if (!response.ok) return null;
        const contentLength = Number(response.headers.get("content-length") || "0");
        if (contentLength > MAX_LOGO_BYTES) return null;
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.byteLength > MAX_LOGO_BYTES) return null;
        return buffer;
      } finally {
        clearTimeout(timeout);
      }
    }
  } catch {
    // Logo failed to load (missing file, network error, unsupported format) - continue without it.
  }
  return null;
}

function drawLogo(doc: PDFKit.PDFDocument, logo: Buffer, x0: number, usableWidth: number): void {
  const size = Math.min(64, usableWidth);
  const x = x0 + (usableWidth - size) / 2;
  try {
    doc.image(logo, x, doc.y, { width: size, height: size });
    doc.y += size + 8;
  } catch {
    // Not a decodable image (e.g. unsupported format) - skip it.
  }
}

function drawSeparator(doc: PDFKit.PDFDocument, x0: number, width: number, dashed = false): void {
  const y = doc.y;
  if (dashed) doc.dash(2, { space: 2 });
  doc
    .moveTo(x0, y)
    .lineTo(x0 + width, y)
    .lineWidth(0.75)
    .strokeColor("#000000")
    .stroke();
  if (dashed) doc.undash();
  doc.y = y + 6;
}

function drawRow(doc: PDFKit.PDFDocument, x0: number, y: number, cols: Column[], bold = false): number {
  doc.font(bold ? "Helvetica-Bold" : "Helvetica");
  let rowHeight = 0;
  let x = x0;
  for (const col of cols) {
    rowHeight = Math.max(rowHeight, doc.heightOfString(col.text, { width: col.width, align: col.align || "left" }));
    x += col.width;
  }
  x = x0;
  for (const col of cols) {
    doc.text(col.text, x, y, { width: col.width, align: col.align || "left" });
    x += col.width;
  }
  doc.font("Helvetica");
  return y + rowHeight;
}

export function invoiceTitle(order: IOrder): string {
  if (!order.invoiceNumber || order.status === "open") return "Bill preview (not a tax invoice)";
  if (order.voidedAt) return "Tax Invoice - VOIDED";
  if (order.status === "cancelled") return "Tax Invoice - CANCELLED";
  return "Tax Invoice";
}

export function orderTypeText(order: IOrder): string {
  if (order.orderType === "takeaway") return "Take away";
  if (order.orderType === "delivery") return `Delivery (${order.deliveryProvider || "Other"})`;
  return "Dine-in";
}

export const PAYMENT_LABELS: Record<string, string> = {
  cash: "cash",
  upi: "UPI",
  card: "card",
  online: "online",
  wallet: "wallet",
};

export function upiPaymentLink(vpa: string, payeeName: string, amount: number, note: string): string {
  const params = new URLSearchParams({ pa: vpa, pn: payeeName, am: amount.toFixed(2), cu: "INR", tn: note });
  return `upi://pay?${params.toString()}`;
}

export async function streamInvoicePdf(
  res: Response,
  data: {
    restaurant: IRestaurant;
    order: IOrder;
    items: IOrderItem[];
    totals: InvoiceTotals;
    preview?: boolean;
  }
) {
  const { restaurant, order, items, totals } = data;
  const settings = restaurant.invoiceSettings;
  const paperSize = settings?.paperSize || "a5";
  // Which details show, and how big each part is, for this paper (Settings -> Invoice -> Invoice layout).
  const layout = resolveInvoiceLayout(settings, paperKeyFor(paperSize));
  const show = layout.show;
  const fz = (group: InvoiceFontKey, base: number) =>
    Math.max(6, Math.round(base * SIZE_SCALE[layout.fonts[group]]));

  const logo = show.logo ? await resolveLogoBuffer(restaurant.logoUrl) : null;
  const upiVpa = restaurant.billingSettings?.upiVpa;
  const upiQr =
    show.upiQr && order.status === "billed" && upiVpa && order.invoiceNumber
      ? await QRCode.toBuffer(
          upiPaymentLink(
            upiVpa,
            restaurant.billingSettings?.upiPayeeName || restaurant.name,
            totals.grandTotal,
            order.invoiceNumber
          ),
          { margin: 1, width: 240 }
        )
      : null;

  const archive = (pdf: Buffer) =>
    putObject("invoices", `${restaurant._id}/${order._id}.pdf`, pdf, "application/pdf").then(() => undefined);

  await renderToPaper(
    res,
    `invoice-${order.invoiceNumber ? order.invoiceNumber.replace(/[^A-Za-z0-9-]/g, "-") : order._id}.pdf`,
    paperSize,
    (doc, x0, usableWidth) => {
      if (logo) drawLogo(doc, logo, x0, usableWidth);

      if (show.restaurantName) doc.fontSize(fz("header", 16)).text(restaurant.name, { align: "center" });
      if (show.address && restaurant.address)
        doc.fontSize(fz("header", 9)).text(restaurant.address, { align: "center" });
      if (show.gstin && restaurant.gstin)
        doc.fontSize(fz("header", 9)).text(`GSTIN: ${restaurant.gstin}`, { align: "center" });
      if (show.fssai && restaurant.fssaiLicense)
        doc.fontSize(fz("header", 9)).text(`FSSAI Reg. No: ${restaurant.fssaiLicense}`, { align: "center" });
      doc.moveDown(0.5);
      doc.fontSize(fz("header", 12)).text(invoiceTitle(order), { align: "center" });
      // The cafe token sits in the header, under the title, where the guest looks for it.
      const tokenText = restaurant.serviceFlow === "cafe" ? orderTokenText(items) : "";
      if (show.token && tokenText) {
        doc.moveDown(0.2);
        doc.font("Helvetica-Bold").fontSize(fz("header", 16)).text(tokenText.toUpperCase(), { align: "center" });
        doc.font("Helvetica");
      }
      doc.moveDown(0.5);
      drawSeparator(doc, x0, usableWidth, true);

      doc.fontSize(fz("details", 10));
      if (show.invoiceNumber && order.invoiceNumber) doc.text(`Invoice No: ${order.invoiceNumber}`);
      const billDate = order.billedAt ?? order.checkinTime;
      if (show.dateTime) {
        doc.text(
          `Date: ${new Date(billDate).toLocaleString("en-IN", { timeZone: restaurant.timezone || "Asia/Kolkata" })}`
        );
      }
      if (show.orderType) doc.text(`Order: ${orderTypeText(order)}`);
      if (show.customerName) {
        doc.text(
          `Customer: ${order.customerName}` +
            (show.customerPhone && order.customerPhone ? `  (${billPhone(order.customerPhone, settings)})` : "")
        );
      } else if (show.customerPhone && order.customerPhone) {
        doc.text(`Phone: ${billPhone(order.customerPhone, settings)}`);
      }
      if (show.customerGstin && order.customerGstin) doc.text(`Customer GSTIN: ${order.customerGstin}`);
      const placeOfSupply = order.bill?.placeOfSupply || settings?.placeOfSupply;
      if (show.placeOfSupply && placeOfSupply) doc.text(`Place of supply: ${placeOfSupply}`);
      if (show.sac) doc.text(`SAC: ${order.bill?.sac || DEFAULT_SAC} (restaurant service)`);
      doc.moveDown(0.3);
      drawSeparator(doc, x0, usableWidth);

      const wantUnitPrice = show.unitPrice;
      const showJainTag = show.tags;

      // The dish column is only as wide as the longest dish name needs, so qty sits close to the name instead of
      // far to the right. Qty, price and total never get narrower than their heading and biggest number, so a
      // heading like "Qty" never wraps; the rest of the width goes to the dish column.
      doc.fontSize(fz("items", 10));
      const widest = (samples: string[], bold = false) => {
        doc.font(bold ? "Helvetica-Bold" : "Helvetica");
        const width = Math.max(...samples.map((sample) => doc.widthOfString(sample)));
        doc.font("Helvetica");
        return Math.ceil(width) + 4;
      };
      const longestName = Math.max(
        0,
        ...items
          .filter((i) => i.status !== "cancelled")
          .map((i) => doc.widthOfString(i.foodName + (showJainTag && i.isJain ? " (Jain)" : "")))
      );
      const qtyMin = Math.max(widest(["Qty"], true), widest(["99"]));
      const priceMin = Math.max(widest(["Price"], true), widest(["9999.99"]));
      const totalMin = Math.max(widest(["Total"], true), widest(["99999.99"]));
      // On a narrow roll there is no room for a price column as well, so it is left out rather than
      // pushing the total off the paper.
      const showUnitPrice = wantUnitPrice && usableWidth - (qtyMin + priceMin + totalMin) >= usableWidth * 0.4;
      const numbersMin = qtyMin + totalMin + (showUnitPrice ? priceMin : 0);
      const itemMax = Math.max(usableWidth - numbersMin, usableWidth * 0.25);
      const itemWidth = Math.min(Math.max(longestName + 8, usableWidth * 0.3), itemMax);
      const extra = Math.max(usableWidth - itemWidth - numbersMin, 0);
      const cols = showUnitPrice
        ? [
            { key: "item", width: itemWidth },
            { key: "qty", width: qtyMin + extra * 0.2, align: "right" as const },
            { key: "price", width: priceMin + extra * 0.4, align: "right" as const },
            { key: "total", width: totalMin + extra * 0.4, align: "right" as const },
          ]
        : [
            { key: "item", width: itemWidth },
            { key: "qty", width: qtyMin + extra * 0.3, align: "right" as const },
            { key: "total", width: totalMin + extra * 0.7, align: "right" as const },
          ];

      let y = drawRow(
        doc,
        x0,
        doc.y,
        cols.map((c) => ({
          text: c.key === "item" ? "Item" : c.key === "qty" ? "Qty" : c.key === "price" ? "Price" : "Total",
          width: c.width,
          align: c.align,
        })),
        true
      );
      doc.y = y + 3;
      drawSeparator(doc, x0, usableWidth);

      for (const item of items.filter((i) => i.status !== "cancelled")) {
        const name = item.foodName + (showJainTag && item.isJain ? " (Jain)" : "");
        const rowCols: Column[] = showUnitPrice
          ? [
              { text: name, width: cols[0].width },
              { text: String(item.quantity), width: cols[1].width, align: "right" },
              { text: item.unitPrice.toFixed(2), width: cols[2].width, align: "right" },
              { text: item.total.toFixed(2), width: cols[3].width, align: "right" },
            ]
          : [
              { text: name, width: cols[0].width },
              { text: String(item.quantity), width: cols[1].width, align: "right" },
              { text: item.total.toFixed(2), width: cols[2].width, align: "right" },
            ];
        y = drawRow(doc, x0, doc.y, rowCols);
        if (item.complimentary) {
          // The mark sits under the dish, not on the kitchen ticket.
          doc.fontSize(Math.max(fz("items", 10) - 2, 6)).font("Helvetica-Oblique");
          doc.text("Complimentary", x0, y, { width: cols[0].width });
          y = doc.y;
          doc.font("Helvetica").fontSize(fz("items", 10));
        }
        doc.y = y + 3;
      }

      doc.moveDown(0.3);
      drawSeparator(doc, x0, usableWidth);

      doc.moveDown(0.3);
      const totalsLabelWidth = usableWidth * 0.6;
      const totalsAmountWidth = usableWidth * 0.4;

      doc.fontSize(fz("totals", 10));
      let ty = drawRow(doc, x0, doc.y, [
        { text: "Subtotal", width: totalsLabelWidth },
        { text: totals.subtotal.toFixed(2), width: totalsAmountWidth, align: "right" },
      ]);
      doc.y = ty + 2;

      const couponDiscount = totals.couponDiscount ?? totals.discount;
      const manualDiscount = totals.manualDiscount ?? 0;
      if (show.discounts && couponDiscount > 0) {
        ty = drawRow(doc, x0, doc.y, [
          { text: order.couponCode ? `Coupon (${order.couponCode})` : "Discount", width: totalsLabelWidth },
          { text: `-${couponDiscount.toFixed(2)}`, width: totalsAmountWidth, align: "right" },
        ]);
        doc.y = ty + 2;
      }
      if (show.discounts && manualDiscount > 0) {
        ty = drawRow(doc, x0, doc.y, [
          { text: "Discount", width: totalsLabelWidth },
          { text: `-${manualDiscount.toFixed(2)}`, width: totalsAmountWidth, align: "right" },
        ]);
        doc.y = ty + 2;
      }
      if (show.discounts && (totals.loyaltyDiscount ?? 0) > 0) {
        ty = drawRow(doc, x0, doc.y, [
          { text: "Loyalty points", width: totalsLabelWidth },
          { text: `-${totals.loyaltyDiscount.toFixed(2)}`, width: totalsAmountWidth, align: "right" },
        ]);
        doc.y = ty + 2;
      }
      if (show.charges && (totals.serviceCharge ?? 0) > 0) {
        ty = drawRow(doc, x0, doc.y, [
          { text: `Service charge (${totals.serviceChargePercent}%)`, width: totalsLabelWidth },
          { text: totals.serviceCharge.toFixed(2), width: totalsAmountWidth, align: "right" },
        ]);
        doc.y = ty + 2;
      }
      if (show.charges && (totals.packagingCharge ?? 0) > 0) {
        ty = drawRow(doc, x0, doc.y, [
          { text: "Packaging", width: totalsLabelWidth },
          { text: totals.packagingCharge.toFixed(2), width: totalsAmountWidth, align: "right" },
        ]);
        doc.y = ty + 2;
      }
      for (const extra of show.charges ? (totals.extraCharges ?? []) : []) {
        ty = drawRow(doc, x0, doc.y, [
          { text: extra.name, width: totalsLabelWidth },
          { text: extra.amount.toFixed(2), width: totalsAmountWidth, align: "right" },
        ]);
        doc.y = ty + 2;
      }

      if (show.taxBreakdown) {
        ty = drawRow(doc, x0, doc.y, [
          { text: "Taxable value", width: totalsLabelWidth },
          { text: totals.taxableAmount.toFixed(2), width: totalsAmountWidth, align: "right" },
        ]);
        doc.y = ty + 2;
      }

      for (const tax of show.taxBreakdown ? totals.taxLines : []) {
        ty = drawRow(doc, x0, doc.y, [
          { text: `${tax.name} (${tax.percent}%)`, width: totalsLabelWidth },
          { text: tax.amount.toFixed(2), width: totalsAmountWidth, align: "right" },
        ]);
        doc.y = ty + 2;
      }

      if (show.roundOff && totals.roundOff !== 0) {
        ty = drawRow(doc, x0, doc.y, [
          { text: "Round off", width: totalsLabelWidth },
          {
            text: `${totals.roundOff > 0 ? "+" : ""}${totals.roundOff.toFixed(2)}`,
            width: totalsAmountWidth,
            align: "right",
          },
        ]);
        doc.y = ty + 2;
      }

      doc.moveDown(0.2);
      doc.fontSize(fz("grandTotal", 11));
      ty = drawRow(
        doc,
        x0,
        doc.y,
        [
          { text: "Grand Total", width: totalsLabelWidth },
          { text: totals.grandTotal.toFixed(2), width: totalsAmountWidth, align: "right" },
        ],
        true
      );
      doc.y = ty;

      const paidLines = (order.payments ?? []).filter((p) => p.amount > 0);
      if (show.payments && paidLines.length) {
        doc.moveDown(0.3);
        doc.fontSize(fz("totals", 9));
        for (const payment of paidLines) {
          const label =
            `Paid by ${PAYMENT_LABELS[payment.method] ?? payment.method}` +
            (payment.reference ? ` (${payment.reference})` : "");
          ty = drawRow(doc, x0, doc.y, [
            { text: label, width: totalsLabelWidth },
            { text: payment.amount.toFixed(2), width: totalsAmountWidth, align: "right" },
          ]);
          doc.y = ty + 1;
          if (payment.change) {
            ty = drawRow(doc, x0, doc.y, [
              { text: `Cash received ${payment.tendered?.toFixed(2)}, change`, width: totalsLabelWidth },
              { text: payment.change.toFixed(2), width: totalsAmountWidth, align: "right" },
            ]);
            doc.y = ty + 1;
          }
        }
      }

      if (upiQr) {
        doc.moveDown(0.5);
        const size = Math.min(120, usableWidth * 0.6);
        doc.image(upiQr, x0 + (usableWidth - size) / 2, doc.y, { width: size, height: size });
        doc.y += size + 4;
        doc.fontSize(fz("footer", 8)).text(`Scan to pay Rs. ${totals.grandTotal.toFixed(2)} with any UPI app`, x0, doc.y, {
          width: usableWidth,
          align: "center",
        });
      }

      doc.moveDown(0.3);
      drawSeparator(doc, x0, usableWidth, true);

      if (show.terms && settings?.termsText) {
        doc.fontSize(fz("footer", 8)).text(settings.termsText, { align: "left" });
        doc.moveDown(0.3);
      }

      if (show.footer) {
        doc
          .fontSize(fz("footer", 9))
          .text(settings?.footerNote || "Thank you for dining with us!", { align: "center" });
      }
    },
    data.preview ? undefined : archive
  );
}

export async function streamKotPdf(
  res: Response,
  data: {
    restaurant: IRestaurant;
    order: IOrder;
    round: number;
    items: IOrderItem[];
    tableCode?: string;
    tokenNumber?: number | null;
  }
) {
  const { restaurant, order, round, items, tableCode, tokenNumber } = data;
  const settings = restaurant.kotSettings;
  const paperSize = settings?.paperSize || "thermal80";
  // Which details show, and how big each part is, for this paper (Settings -> Kitchen tickets -> Ticket layout).
  const layout = resolveKotLayout(settings, paperKeyFor(paperSize));
  const fz = (group: KotFontKey, base: number) =>
    Math.max(6, Math.round(base * SIZE_SCALE[layout.fonts[group]]));

  const logo = layout.show.logo ? await resolveLogoBuffer(restaurant.logoUrl) : null;

  // With "split by category" every category is its own ticket on its own page, all with the same token.
  const sections: { category?: string; items: IOrderItem[] }[] = [];
  if (settings?.splitByCategory) {
    const byTicket = new Map<string, IOrderItem[]>();
    for (const item of items) {
      const key = kotTicketKey(item, settings.categoryGroups);
      byTicket.set(key, [...(byTicket.get(key) ?? []), item]);
    }
    for (const group of byTicket.values()) sections.push({ category: kotTicketLabel(group), items: group });
  } else {
    sections.push({ items });
  }

  await renderToPaper(res, `kot-${order._id}-round${round}.pdf`, paperSize, (doc, x0, usableWidth) => {
    let tallest = 0;
    sections.forEach((section, index) => {
      if (index > 0) doc.addPage();
      drawKotTicket(doc, x0, usableWidth, section.items, section.category);
      tallest = Math.max(tallest, doc.y);
    });
    return tallest;
  });

  function drawKotTicket(
    doc: PDFKit.PDFDocument,
    x0: number,
    usableWidth: number,
    items: IOrderItem[],
    category?: string
  ) {
    if (logo) drawLogo(doc, logo, x0, usableWidth);

    if (layout.show.restaurantName) doc.fontSize(fz("header", 14)).text(restaurant.name, { align: "center" });
    if (layout.show.header) {
      doc
        .fontSize(fz("header", 12))
        .text(`${settings?.headerText || "Kitchen Order Ticket"} - Round ${round}`, { align: "center" });
    }
    if (tokenNumber && layout.show.token) {
      // The number the kitchen calls out - biggest thing on the ticket.
      doc.moveDown(0.2);
      doc.font("Helvetica-Bold").fontSize(fz("token", 20)).text(`TOKEN ${tokenNumber}`, { align: "center" });
      doc.font("Helvetica");
    }
    if (category && layout.show.station) {
      doc.moveDown(0.2);
      doc.font("Helvetica-Bold").fontSize(fz("header", 13)).text(category.toUpperCase(), { align: "center" });
      doc.font("Helvetica");
    }
    doc.moveDown(0.5);
    drawSeparator(doc, x0, usableWidth, true);

    if (order.orderType !== "dine-in" && layout.show.orderInfo) {
      doc
        .font("Helvetica-Bold")
        .fontSize(fz("orderInfo", 14))
        .text(order.orderType === "takeaway" ? "*** TAKE AWAY - PACK ***" : "*** DELIVERY - PACK ***", {
          align: "center",
        });
      doc.font("Helvetica");
      doc.moveDown(0.2);
    }

    if (layout.show.orderInfo) {
      if (order.orderType === "dine-in") {
        doc
          .font("Helvetica-Bold")
          .fontSize(fz("orderInfo", 16))
          .text(tableCode ? `Table: ${tableCode}` : "Dine-in", { align: "center" });
        doc.font("Helvetica");
        doc.moveDown(0.2);
      } else if (order.orderType === "delivery") {
        doc.fontSize(fz("orderInfo", 10)).text(`Order: Delivery (${order.deliveryProvider})`);
      }
    }
    doc.fontSize(fz("orderInfo", 10));
    if (layout.show.customerName) {
      doc.text(`Customer: ${order.customerName}`);
    }
    if (layout.show.dateTime) doc.text(`Date: ${new Date().toLocaleString()}`);
    doc.moveDown(0.3);
    drawSeparator(doc, x0, usableWidth);

    const showPrices = layout.show.prices;
    const showTags = layout.show.tags;

    const colWidths = showPrices
      ? [usableWidth * 0.1, usableWidth * 0.42, usableWidth * 0.15, usableWidth * 0.15, usableWidth * 0.18]
      : [usableWidth * 0.12, usableWidth * 0.63, usableWidth * 0.25];

    const headerCols: Column[] = showPrices
      ? [
          { text: "Sr.", width: colWidths[0] },
          { text: "Food", width: colWidths[1] },
          { text: "Qty", width: colWidths[2], align: "right" },
          { text: "Price", width: colWidths[3], align: "right" },
          { text: "Total", width: colWidths[4], align: "right" },
        ]
      : [
          { text: "Sr.", width: colWidths[0] },
          { text: "Food", width: colWidths[1] },
          { text: "Qty", width: colWidths[2], align: "right" },
        ];

    doc.fontSize(fz("items", 10));
    let y = drawRow(doc, x0, doc.y, headerCols, true);
    doc.y = y + 3;
    drawSeparator(doc, x0, usableWidth);

    // A paid and a complimentary plate of the same dish are cooked together: one line (unless prices are shown).
    mergeKotLines(items, { keepComplimentary: showPrices }).forEach((item, idx) => {
      const name =
        item.foodName + (showTags && item.isJain ? " (Jain)" : "") + (showTags && item.isPacked ? " (PACK)" : "");
      const rowCols: Column[] = showPrices
        ? [
            { text: String(idx + 1), width: colWidths[0] },
            { text: name, width: colWidths[1] },
            { text: String(item.quantity), width: colWidths[2], align: "right" },
            { text: item.unitPrice.toFixed(2), width: colWidths[3], align: "right" },
            { text: item.total.toFixed(2), width: colWidths[4], align: "right" },
          ]
        : [
            { text: String(idx + 1), width: colWidths[0] },
            { text: name, width: colWidths[1] },
            { text: String(item.quantity), width: colWidths[2], align: "right" },
          ];
      y = drawRow(doc, x0, doc.y, rowCols);
      doc.y = y + 3;
      // Customizations & kitchen note printed under the dish so the line cook sees them.
      const extras = [...(item.modifiers?.map((m) => m.label) ?? []), item.note].filter(Boolean).join(", ");
      if (extras && layout.show.notes) {
        doc
          .font("Helvetica-Bold")
          .fontSize(fz("notes", 9))
          .text(`  → ${extras}`, x0 + colWidths[0], doc.y, { width: usableWidth - colWidths[0] });
        doc.font("Helvetica").fontSize(fz("items", 10));
        doc.y += 2;
      }
      for (const part of layout.show.comboParts ? (item.components ?? []) : []) {
        doc
          .fontSize(fz("notes", 9))
          .text(`  - ${part.quantity * item.quantity} x ${part.name}`, x0 + colWidths[0], doc.y, {
            width: usableWidth - colWidths[0],
          });
        doc.fontSize(fz("items", 10));
        doc.y += 1;
      }
    });

    doc.moveDown(0.3);
    drawSeparator(doc, x0, usableWidth, true);

    if (layout.show.itemCount) {
      const count = items.reduce((sum, i) => sum + i.quantity, 0);
      doc.fontSize(fz("items", 9)).text(`${count} item${count === 1 ? "" : "s"}`, { align: "left" });
    }
    if (settings?.footerNote && layout.show.footer) {
      doc.fontSize(fz("footer", 9)).text(settings.footerNote, { align: "center" });
    }
  }
}

export async function streamOrdersReportPdf(
  res: Response,
  data: {
    restaurant: IRestaurant;
    filename: string;
    title: string;
    rangeLabel: string;
    rows: OrdersReportRow[];
    total: number;
    count: number;
  }
): Promise<void> {
  const { restaurant, filename, title, rangeLabel, rows, total, count } = data;
  const margin = 36;

  const pdf = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = margin;
    const right = doc.page.width - margin;
    const width = right - left;
    // Column x-offsets and widths: customer, type, check-in, status, payment, total.
    const cols = [
      { key: "customer", label: "Customer", w: 0.24, align: "left" as const },
      { key: "type", label: "Type", w: 0.2, align: "left" as const },
      { key: "checkin", label: "Check-in", w: 0.22, align: "left" as const },
      { key: "status", label: "Status", w: 0.12, align: "left" as const },
      { key: "payment", label: "Payment", w: 0.1, align: "left" as const },
      { key: "total", label: "Total", w: 0.12, align: "right" as const },
    ];
    const xs: number[] = [];
    let acc = left;
    for (const c of cols) {
      xs.push(acc);
      acc += c.w * width;
    }

    doc.font("Helvetica-Bold").fontSize(16).fillColor("#111").text(restaurant.name, left, doc.y);
    doc.font("Helvetica").fontSize(11).fillColor("#333").text(title);
    doc.fontSize(9).fillColor("#666").text(`${rangeLabel}  |  Generated ${new Date().toLocaleString()}`);
    doc.moveDown(0.6);

    const drawHeader = () => {
      const y = doc.y;
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#111");
      cols.forEach((c, i) => doc.text(c.label, xs[i], y, { width: c.w * width - 4, align: c.align }));
      doc.moveDown(0.3);
      doc.moveTo(left, doc.y).lineTo(right, doc.y).lineWidth(0.5).strokeColor("#bbb").stroke();
      doc.moveDown(0.2);
    };
    drawHeader();

    doc.font("Helvetica").fontSize(9).fillColor("#222");
    for (const row of rows) {
      // Start a new page (and repeat the header) before a row would overflow the bottom margin.
      if (doc.y > doc.page.height - margin - 40) {
        doc.addPage();
        drawHeader();
        doc.font("Helvetica").fontSize(9).fillColor("#222");
      }
      const y = doc.y;
      const cells = [row.customer, row.type, row.checkin, row.status, row.payment, row.total.toFixed(2)];
      let maxH = 0;
      cells.forEach((val, i) => {
        const w = cols[i].w * width - 4;
        const h = doc.heightOfString(String(val), { width: w });
        if (h > maxH) maxH = h;
      });
      cells.forEach((val, i) =>
        doc.text(String(val), xs[i], y, { width: cols[i].w * width - 4, align: cols[i].align })
      );
      doc.y = y + maxH + 3;
    }

    doc.moveDown(0.3);
    doc.moveTo(left, doc.y).lineTo(right, doc.y).lineWidth(0.5).strokeColor("#bbb").stroke();
    doc.moveDown(0.3);
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111");
    const ty = doc.y;
    doc.text(`Total orders: ${count}`, left, ty, { width: width * 0.6, align: "left" });
    doc.text(`Grand total: ${total.toFixed(2)}`, left, ty, { width, align: "right" });

    doc.end();
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.end(pdf);
}
