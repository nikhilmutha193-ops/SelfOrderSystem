import type { OrderDetailResponse } from "../../lib/types";

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const money = (n: number) => `Rs. ${n.toFixed(2)}`;

/** An 80 mm slip with the pickup number, printed by the kiosk's own (default) printer. */
export function kioskReceiptHtml(detail: OrderDetailResponse, restaurantName: string, paid: boolean): string {
  const { order, items, totals } = detail;
  const lines = items
    .filter((i) => i.status !== "cancelled")
    .map(
      (i) =>
        `<tr><td>${i.quantity} x ${escape(i.foodName)}${
          i.modifiers?.length ? `<br><small>${escape(i.modifiers.map((m) => m.label).join(", "))}</small>` : ""
        }</td><td class="r">${money(i.total)}</td></tr>`
    )
    .join("");
  const taxes = totals.taxLines.map((t) => `<tr><td>${escape(t.name)} ${t.percent}%</td><td class="r">${money(t.amount)}</td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: 80mm auto; margin: 4mm; }
    body { font-family: system-ui, sans-serif; width: 72mm; margin: 0; color: #000; }
    h1 { font-size: 16px; text-align: center; margin: 0 0 4px; }
    .num { font-size: 56px; font-weight: 800; text-align: center; margin: 4px 0; }
    .tag { text-align: center; font-weight: 700; font-size: 14px; border: 2px solid #000; padding: 4px; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    td { padding: 2px 0; vertical-align: top; } .r { text-align: right; white-space: nowrap; }
    .total td { border-top: 1px dashed #000; font-weight: 700; font-size: 14px; padding-top: 4px; }
    p { font-size: 11px; text-align: center; margin: 6px 0 0; }
  </style></head><body>
    <h1>${escape(restaurantName)}</h1>
    <p>Order number</p>
    <div class="num">${order.pickupNumber ?? ""}</div>
    <div class="tag">${order.orderType === "takeaway" ? "TAKE AWAY" : "EAT HERE"} · ${paid ? "PAID" : "PAY AT COUNTER"}</div>
    <table>${lines}
      <tr><td>Subtotal</td><td class="r">${money(totals.subtotal)}</td></tr>
      ${(totals.packagingCharge ?? 0) > 0 ? `<tr><td>Packaging</td><td class="r">${money(totals.packagingCharge!)}</td></tr>` : ""}
      ${taxes}
      ${totals.roundOff ? `<tr><td>Round off</td><td class="r">${money(totals.roundOff)}</td></tr>` : ""}
      <tr class="total"><td>Total</td><td class="r">${money(totals.grandTotal)}</td></tr>
    </table>
    ${order.invoiceNumber ? `<p>Bill ${escape(order.invoiceNumber)}</p>` : ""}
    <p>${new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
    <p>${paid ? "We'll show your number when it's ready." : "Please pay at the counter. Your order is made once paid."}</p>
  </body></html>`;
}
