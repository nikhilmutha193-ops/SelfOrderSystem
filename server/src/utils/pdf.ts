import PDFDocument from "pdfkit";
import { Response } from "express";
import path from "path";
import fs from "fs/promises";
import dns from "dns/promises";
import net from "net";
import { IRestaurant, PrintFontSize, PrintPaperSize } from "../models/Restaurant";
import { IOrder } from "../models/Order";
import { IOrderItem } from "../models/OrderItem";
import { InvoiceTotals } from "./invoice";
import { UPLOADS_DIR, putObject } from "./objectStore";
import { describeError, logger } from "./logger";

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

// Blocks SSRF: an admin-supplied logo URL must not resolve to a private/loopback/
// link-local address before we let the server fetch it.
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

const THERMAL_MIN_HEIGHT = 160;
const THERMAL_MAX_HEIGHT = 2200;

function isThermal(paperSize: PrintPaperSize): boolean {
  return paperSize === "thermal58" || paperSize === "thermal80";
}

const FONT_SCALE: Record<PrintFontSize, number> = {
  compact: 0.85,
  normal: 1,
  large: 1.2,
};

interface Column {
  text: string;
  width: number;
  align?: "left" | "right" | "center";
}

// Thermal receipts print on a continuous roll, not a fixed sheet - a hardcoded
// tall page wastes paper (and looked like an A4 sheet). We render the ticket
// once on a throwaway oversized page purely to measure how tall the content
// actually is, then render it for real onto a page sized to fit that content.
async function renderToPaper(
  res: Response,
  filename: string,
  paperSize: PrintPaperSize,
  render: (doc: PDFKit.PDFDocument, x0: number, usableWidth: number) => void,
  archive?: (pdf: Buffer) => Promise<void>
): Promise<void> {
  const width = PAPER_WIDTH[paperSize];
  const margin = isThermal(paperSize) ? 12 : 30;
  const usableWidth = width - margin * 2;

  let height = FIXED_PAPER_HEIGHT[paperSize];
  if (height === undefined) {
    const measureDoc = new PDFDocument({ size: [width, THERMAL_MAX_HEIGHT], margin, bufferPages: true });
    render(measureDoc, margin, usableWidth);
    height = Math.min(THERMAL_MAX_HEIGHT, Math.max(THERMAL_MIN_HEIGHT, Math.ceil(measureDoc.y + margin)));
  }

  // Buffered rather than piped: a serverless function can freeze once the response
  // ends, so the archive upload has to finish first.
  const pdf = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: [width, height], margin });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    render(doc, margin, usableWidth);
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

export async function streamInvoicePdf(
  res: Response,
  data: { restaurant: IRestaurant; order: IOrder; items: IOrderItem[]; totals: InvoiceTotals }
) {
  const { restaurant, order, items, totals } = data;
  const settings = restaurant.invoiceSettings;
  const fontSize: PrintFontSize = settings?.fontSize || "normal";
  const scale = FONT_SCALE[fontSize];
  const fz = (base: number) => Math.max(6, Math.round(base * scale));
  const paperSize = settings?.paperSize || "a5";

  const logo = settings?.showLogo ? await resolveLogoBuffer(restaurant.logoUrl) : null;

  const archive = (pdf: Buffer) =>
    putObject("invoices", `${restaurant._id}/${order._id}.pdf`, pdf, "application/pdf").then(() => undefined);

  await renderToPaper(res, `invoice-${order._id}.pdf`, paperSize, (doc, x0, usableWidth) => {
    if (logo) drawLogo(doc, logo, x0, usableWidth);

    doc.fontSize(fz(16)).text(restaurant.name, { align: "center" });
    if (restaurant.address) doc.fontSize(fz(9)).text(restaurant.address, { align: "center" });
    if (restaurant.gstin) doc.fontSize(fz(9)).text(`GSTIN: ${restaurant.gstin}`, { align: "center" });
    if (restaurant.fssaiLicense) doc.fontSize(fz(9)).text(`FSSAI Reg. No: ${restaurant.fssaiLicense}`, { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(fz(12)).text("Invoice", { align: "center" });
    doc.moveDown(0.5);
    drawSeparator(doc, x0, usableWidth, true);

    doc.fontSize(fz(10));
    doc.text(`Order: ${order.orderType === "dine-in" ? "Dine-in" : `Delivery (${order.deliveryProvider})`}`);
    doc.text(
      `Customer: ${order.customerName}` +
        (settings?.showCustomerPhone !== false && order.customerPhone ? `  (${order.customerPhone})` : "")
    );
    doc.text(`Date: ${new Date(order.checkinTime).toLocaleString()}`);
    doc.moveDown(0.3);
    drawSeparator(doc, x0, usableWidth);

    const showUnitPrice = settings?.showUnitPrice !== false;
    const showJainTag = settings?.showJainTag !== false;

    const cols = showUnitPrice
      ? [
          { key: "item", width: usableWidth * 0.4 },
          { key: "qty", width: usableWidth * 0.15, align: "right" as const },
          { key: "price", width: usableWidth * 0.2, align: "right" as const },
          { key: "total", width: usableWidth * 0.25, align: "right" as const },
        ]
      : [
          { key: "item", width: usableWidth * 0.55 },
          { key: "qty", width: usableWidth * 0.2, align: "right" as const },
          { key: "total", width: usableWidth * 0.25, align: "right" as const },
        ];

    doc.fontSize(fz(10));
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
      doc.y = y + 3;
    }

    doc.moveDown(0.3);
    drawSeparator(doc, x0, usableWidth);

    doc.moveDown(0.3);
    const totalsLabelWidth = usableWidth * 0.6;
    const totalsAmountWidth = usableWidth * 0.4;

    doc.fontSize(fz(10));
    let ty = drawRow(doc, x0, doc.y, [
      { text: "Subtotal", width: totalsLabelWidth },
      { text: totals.subtotal.toFixed(2), width: totalsAmountWidth, align: "right" },
    ]);
    doc.y = ty + 2;

    if (totals.discount > 0) {
      ty = drawRow(doc, x0, doc.y, [
        { text: order.couponCode ? `Discount (${order.couponCode})` : "Discount", width: totalsLabelWidth },
        { text: `-${totals.discount.toFixed(2)}`, width: totalsAmountWidth, align: "right" },
      ]);
      doc.y = ty + 2;
    }

    for (const tax of totals.taxLines) {
      ty = drawRow(doc, x0, doc.y, [
        { text: `${tax.name} (${tax.percent}%)`, width: totalsLabelWidth },
        { text: tax.amount.toFixed(2), width: totalsAmountWidth, align: "right" },
      ]);
      doc.y = ty + 2;
    }

    doc.moveDown(0.2);
    doc.fontSize(fz(11));
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

    doc.moveDown(0.3);
    drawSeparator(doc, x0, usableWidth, true);

    if (settings?.termsText) {
      doc.fontSize(fz(8)).text(settings.termsText, { align: "left" });
      doc.moveDown(0.3);
    }

    doc.fontSize(fz(9)).text(settings?.footerNote || "Thank you for dining with us!", { align: "center" });
  }, archive);
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
  const fontSize: PrintFontSize = settings?.fontSize || "normal";
  const scale = FONT_SCALE[fontSize];
  const fz = (base: number) => Math.max(6, Math.round(base * scale));
  const paperSize = settings?.paperSize || "thermal80";

  const logo = settings?.showLogo ? await resolveLogoBuffer(restaurant.logoUrl) : null;

  await renderToPaper(res, `kot-${order._id}-round${round}.pdf`, paperSize, (doc, x0, usableWidth) => {
    if (logo) drawLogo(doc, logo, x0, usableWidth);

    doc.fontSize(fz(14)).text(restaurant.name, { align: "center" });
    doc.fontSize(fz(12)).text(`${settings?.headerText || "Kitchen Order Ticket"} - Round ${round}`, { align: "center" });
    if (tokenNumber) {
      // The number the kitchen calls out - biggest thing on the ticket.
      doc.moveDown(0.2);
      doc.font("Helvetica-Bold").fontSize(fz(20)).text(`TOKEN ${tokenNumber}`, { align: "center" });
      doc.font("Helvetica");
    }
    doc.moveDown(0.5);
    drawSeparator(doc, x0, usableWidth, true);

    // Packing is a kitchen instruction, not table info, so it prints even when
    // table info is switched off - otherwise a take-away could be plated to serve.
    if (order.orderType !== "dine-in") {
      doc
        .font("Helvetica-Bold")
        .fontSize(fz(14))
        .text(order.orderType === "takeaway" ? "*** TAKE AWAY - PACK ***" : "*** DELIVERY - PACK ***", {
          align: "center",
        });
      doc.font("Helvetica");
      doc.moveDown(0.2);
    }

    if (settings?.showTableInfo !== false) {
      if (order.orderType === "dine-in") {
        doc
          .font("Helvetica-Bold")
          .fontSize(fz(16))
          .text(tableCode ? `Table: ${tableCode}` : "Dine-in", { align: "center" });
        doc.font("Helvetica");
        doc.moveDown(0.2);
      } else if (order.orderType === "delivery") {
        doc.fontSize(fz(10)).text(`Order: Delivery (${order.deliveryProvider})`);
      }
    }
    doc.fontSize(fz(10));
    if (settings?.showCustomerName !== false) {
      doc.text(`Customer: ${order.customerName}`);
    }
    doc.text(`Date: ${new Date().toLocaleString()}`);
    doc.moveDown(0.3);
    drawSeparator(doc, x0, usableWidth);

    const showPrices = !!settings?.showPrices;
    const showJainTag = settings?.showJainTag !== false;

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

    doc.fontSize(fz(10));
    let y = drawRow(doc, x0, doc.y, headerCols, true);
    doc.y = y + 3;
    drawSeparator(doc, x0, usableWidth);

    items.forEach((item, idx) => {
      const name = item.foodName + (showJainTag && item.isJain ? " (Jain)" : "");
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
    });

    doc.moveDown(0.3);
    drawSeparator(doc, x0, usableWidth, true);

    if (settings?.footerNote) {
      doc.fontSize(fz(9)).text(settings.footerNote, { align: "center" });
    }
  });
}

interface OrdersReportRow {
  customer: string;
  type: string;
  checkin: string;
  status: string;
  payment: string;
  total: number;
}

/**
 * Multi-page A4 table of orders with a grand total. Unlike the ticket renderer this
 * lets PDFKit paginate naturally (rows can run to many pages), but still buffers the
 * whole document before responding so it works on serverless too.
 */
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
      cells.forEach((val, i) => doc.text(String(val), xs[i], y, { width: cols[i].w * width - 4, align: cols[i].align }));
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
