import { IManualDiscount } from "../models/Order";
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
  couponDiscount: number;
  manualDiscount: number;
  loyaltyDiscount: number;
  discount: number;
  serviceChargePercent: number;
  serviceCharge: number;
  taxableAmount: number;
  taxLines: InvoiceTaxLine[];
  roundOff: number;
  grandTotal: number;
}

export interface PricingInput {
  couponDiscount?: number;
  manualDiscount?: Pick<IManualDiscount, "type" | "value"> | null;
  loyaltyDiscount?: number;
  serviceChargePercent?: number;
}

export function manualDiscountAmount(
  discount: Pick<IManualDiscount, "type" | "value"> | null | undefined,
  base: number
): number {
  if (!discount || discount.value <= 0 || base <= 0) return 0;
  const raw = discount.type === "percent" ? (base * discount.value) / 100 : discount.value;
  return round2(Math.min(raw, base));
}

export function computeInvoiceTotals(
  items: Pick<IOrderItem, "status" | "total">[],
  taxRates: ITaxRate[],
  pricing: number | PricingInput = 0
): InvoiceTotals {
  const input: PricingInput = typeof pricing === "number" ? { couponDiscount: pricing } : pricing;
  const rawSubtotal = round2(items.filter((i) => i.status !== "cancelled").reduce((sum, i) => sum + i.total, 0));

  const couponDiscount = round2(Math.min(Math.max(input.couponDiscount ?? 0, 0), rawSubtotal));
  const manualDiscount = manualDiscountAmount(input.manualDiscount, round2(rawSubtotal - couponDiscount));
  const loyaltyDiscount = round2(
    Math.min(Math.max(input.loyaltyDiscount ?? 0, 0), round2(rawSubtotal - couponDiscount - manualDiscount))
  );
  const discount = round2(couponDiscount + manualDiscount + loyaltyDiscount);

  const serviceChargePercent = Math.max(input.serviceChargePercent ?? 0, 0);
  const serviceCharge = round2(((rawSubtotal - discount) * serviceChargePercent) / 100);
  const taxableAmount = round2(rawSubtotal - discount + serviceCharge);

  const taxLines: InvoiceTaxLine[] = taxRates.map((rate) => ({
    name: rate.name,
    percent: rate.percent,
    base: taxableAmount,
    amount: round2((taxableAmount * rate.percent) / 100),
  }));

  const exactTotal = round2(taxableAmount + taxLines.reduce((sum, t) => sum + t.amount, 0));
  const grandTotal = Math.round(exactTotal);

  return {
    subtotal: rawSubtotal,
    couponDiscount,
    manualDiscount,
    loyaltyDiscount,
    discount,
    serviceChargePercent,
    serviceCharge,
    taxableAmount,
    taxLines,
    roundOff: round2(grandTotal - exactTotal),
    grandTotal,
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
