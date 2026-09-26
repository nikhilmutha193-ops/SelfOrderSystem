import { IOrderItem } from "../models/OrderItem";
import { ITaxRate } from "../models/Restaurant";

export interface InvoiceTaxLine {
  name: string;
  percent: number;
  base: number;
  amount: number;
}

export interface InvoiceTotals {
  subtotal: number;
  discount: number;
  taxableAmount: number;
  taxLines: InvoiceTaxLine[];
  roundOff: number;
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
    base: taxableAmount,
    amount: round2((taxableAmount * rate.percent) / 100),
  }));

  const exactTotal = round2(taxableAmount + taxLines.reduce((sum, t) => sum + t.amount, 0));
  const grandTotal = Math.round(exactTotal);

  return {
    subtotal: round2(rawSubtotal),
    discount,
    taxableAmount,
    taxLines,
    roundOff: round2(grandTotal - exactTotal),
    grandTotal,
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
