import type { InvoiceRegisterStatus, Order } from "../../lib/types";

export type BadgeTone = "green" | "gray" | "red" | "amber" | "blue";

/** "full" once everything that was paid has gone back, "partial" for some of it, else null. */
export function refundState(order: Pick<Order, "status" | "refundedTotal" | "payments">): "full" | "partial" | null {
  const refunded = order.refundedTotal ?? 0;
  if (order.status !== "closed" || refunded <= 0) return null;
  const paid = (order.payments ?? []).filter((p) => p.method !== "credit").reduce((sum, p) => sum + p.amount, 0);
  return refunded >= paid - 0.01 ? "full" : "partial";
}

export function orderStatusBadge(
  order: Pick<Order, "status" | "voidedAt" | "refundedTotal" | "payments">,
): { tone: BadgeTone; label: string } {
  if (order.voidedAt) return { tone: "red", label: "Voided" };
  const refund = refundState(order);
  if (refund) return refund === "full" ? { tone: "red", label: "Refunded" } : { tone: "amber", label: "Partly refunded" };
  switch (order.status) {
    case "open":
      return { tone: "amber", label: "Open" };
    case "billed":
      return { tone: "blue", label: "Billed, unpaid" };
    case "closed":
      return { tone: "green", label: "Paid" };
    default:
      return { tone: "red", label: "Cancelled" };
  }
}

export const INVOICE_STATUS_BADGE: Record<InvoiceRegisterStatus, { tone: BadgeTone; label: string }> = {
  reopened: { tone: "amber", label: "Reopened" },
  unpaid: { tone: "blue", label: "Unpaid" },
  paid: { tone: "green", label: "Paid" },
  cancelled: { tone: "red", label: "Cancelled" },
  voided: { tone: "red", label: "Voided" },
};

export function orderTypeLabel(order: Pick<Order, "orderType" | "deliveryProvider">): string {
  if (order.orderType === "takeaway") return "Take away";
  if (order.orderType === "delivery") return `Delivery (${order.deliveryProvider ?? "Other"})`;
  return "Dine-in";
}

export function currentFinancialYearLabel(now = new Date()): string {
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const two = (n: number) => String(n % 100).padStart(2, "0");
  return `${two(startYear)}-${two(startYear + 1)}`;
}
