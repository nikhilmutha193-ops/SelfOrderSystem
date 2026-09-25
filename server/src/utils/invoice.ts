import { IOrderItem } from "../models/OrderItem";
import { ITaxRate } from "../models/Restaurant";

export interface InvoiceTaxLine {
  name: string;
  percent: number;
  amount: number;
}

export interface InvoiceTotals {
  subtotal: number;
  discount: number;
  taxLines: InvoiceTaxLine[];
  grandTotal: number;
}

export function computeInvoiceTotals(
  items: Pick<IOrderItem, "status" | "total">[],
  taxRates: ITaxRate[],
  discountAmount = 0
): InvoiceTotals {
  const rawSubtotal = items.filter((i) => i.status !== "cancelled").reduce((sum, i) => sum + i.total, 0);
  const discount = round2(Math.min(Math.max(discountAmount, 0), rawSubtotal));
  const taxableAmount = round2(rawSubtotal - discount);

  const taxLines: InvoiceTaxLine[] = taxRates.map((rate) => ({
    name: rate.name,
    percent: rate.percent,
    amount: round2((taxableAmount * rate.percent) / 100),
  }));

  const grandTotal = round2(taxableAmount + taxLines.reduce((sum, t) => sum + t.amount, 0));

  return { subtotal: round2(rawSubtotal), discount, taxLines, grandTotal };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
