import { TENDER_LABELS, type InvoiceTotals, type PosBilling } from "../../lib/types";
import type { OfflineLine, OfflinePayment, OfflineSale } from "./offline";

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

const money = (n: number) => n.toFixed(2);

const STYLE = `
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  body { font: 12px/1.35 "Courier New", monospace; color: #000; margin: 0; width: 72mm; }
  h1 { font-size: 15px; text-align: center; margin: 0 0 2px; }
  .c { text-align: center; }
  .b { font-weight: 700; }
  .big { font-size: 16px; }
  hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 1px 0; }
  td.r { text-align: right; white-space: nowrap; }
  .sub { font-size: 11px; padding-left: 10px; }
  .tag { border: 1px solid #000; padding: 2px 4px; display: inline-block; margin: 4px 0; font-weight: 700; }
`;

function page(title: string, body: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title><style>${STYLE}</style></head><body>${body}</body></html>`;
}

function when(iso: string) {
  return new Date(iso).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}

function lineExtras(line: OfflineLine) {
  const parts = [
    ...line.modifiers.map((m) => m.label),
    ...(line.components ?? []).map((c) => `${c.quantity * line.quantity} x ${c.name}`),
    line.note,
  ].filter(Boolean);
  return parts.length ? `<div class="sub">${parts.map(escape).join(", ")}</div>` : "";
}

function where(sale: Pick<OfflineSale, "orderType" | "tableCode" | "customerName">) {
  const place = sale.orderType === "takeaway" ? "Takeaway" : `Table ${sale.tableCode ?? ""}`.trim();
  return sale.customerName ? `${place} · ${sale.customerName}` : place;
}

export function kotHtml(sale: OfflineSale, lines: OfflineLine[]) {
  const rows = lines
    .map((l) => `<tr><td class="b big">${l.quantity} x</td><td class="big">${escape(l.name)}${lineExtras(l)}</td></tr>`)
    .join("");
  return page(
    "KOT",
    `<h1>KOT</h1>
     <div class="c"><span class="tag">OFFLINE · ROUND ${sale.kotRounds}</span></div>
     <div class="c b">${escape(where(sale))}</div>
     <div class="c">${when(new Date().toISOString())} · Ref ${escape(sale.clientId.slice(-6).toUpperCase())}</div>
     <hr><table>${rows}</table><hr>`
  );
}

export function receiptHtml(sale: OfflineSale, totals: InvoiceTotals, billing: PosBilling | undefined) {
  const rows = sale.lines
    .map(
      (l) =>
        `<tr><td>${l.quantity} x ${escape(l.name)}${lineExtras(l)}</td><td class="r">${money(l.unitPrice * l.quantity)}</td></tr>`
    )
    .join("");
  const row = (label: string, value: string, strong = false) =>
    `<tr class="${strong ? "b big" : ""}"><td>${escape(label)}</td><td class="r">${value}</td></tr>`;
  const payments = (p: OfflinePayment[]) =>
    p
      .map((x) => {
        const change = x.method === "cash" && x.tendered ? x.tendered - x.amount : 0;
        return (
          row(`Paid ${TENDER_LABELS[x.method]}`, money(x.amount)) +
          (x.tendered ? row("Cash received", money(x.tendered)) : "") +
          (change > 0 ? row("Change", money(change)) : "")
        );
      })
      .join("");
  return page(
    "Provisional bill",
    `<h1>${escape(billing?.restaurantName || "Bill")}</h1>
     ${billing?.address ? `<div class="c">${escape(billing.address)}</div>` : ""}
     ${billing?.gstin ? `<div class="c">GSTIN ${escape(billing.gstin)}</div>` : ""}
     <div class="c"><span class="tag">PROVISIONAL BILL · OFFLINE</span></div>
     <div class="c">${escape(where(sale))}</div>
     <div class="c">${when(sale.createdAt)} · Ref ${escape(sale.clientId.slice(-6).toUpperCase())}</div>
     <hr><table>${rows}</table><hr>
     <table>
       ${row("Subtotal", money(totals.subtotal))}
       ${(totals.serviceCharge ?? 0) > 0 ? row(`Service charge (${totals.serviceChargePercent}%)`, money(totals.serviceCharge!)) : ""}
       ${(totals.packagingCharge ?? 0) > 0 ? row("Packaging", money(totals.packagingCharge!)) : ""}
       ${totals.taxLines.map((t) => row(`${t.name} ${t.percent}%`, money(t.amount))).join("")}
       ${totals.roundOff !== 0 ? row("Round off", money(totals.roundOff)) : ""}
       ${row("Total (Rs.)", money(totals.grandTotal), true)}
       ${payments(sale.payments)}
     </table><hr>
     <div class="c">The tax invoice number is given when this bill syncs.</div>
     ${billing?.footerNote ? `<div class="c">${escape(billing.footerNote)}</div>` : ""}`
  );
}

export function printHtml(html: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } finally {
      window.setTimeout(() => frame.remove(), 60_000);
    }
  };
  frame.srcdoc = html;
  document.body.appendChild(frame);
}
