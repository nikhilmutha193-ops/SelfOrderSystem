import type { InvoiceRegisterStatus, Order } from "../../lib/types";

export type BadgeTone = "green" | "gray" | "red" | "amber" | "blue";

export function orderStatusBadge(order: Pick<Order, "status" | "voidedAt">): { tone: BadgeTone; label: string } {
  if (order.voidedAt) return { tone: "red", label: "Voided" };
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
