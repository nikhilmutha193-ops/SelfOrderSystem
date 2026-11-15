import type { MyOrder } from "../../lib/types";
import { Badge, Card } from "../../shared/ui/ui";

const STATUS: Record<MyOrder["status"], { tone: "amber" | "blue" | "green" | "red"; label: string }> = {
  open: { tone: "amber", label: "Open" },
  billed: { tone: "blue", label: "Bill ready" },
  closed: { tone: "green", label: "Paid" },
  cancelled: { tone: "red", label: "Cancelled" },
};

/** Every order the guest placed in this table session (a new one per round), each with its token. */
export function MyOrdersCard({
  orders,
  viewingId,
  onSelect,
  payFirst = false,
}: {
  orders: MyOrder[];
  viewingId: string;
  onSelect: (orderId: string) => void;
  /** Orders are paid before the kitchen gets them, so an unpaid one is waiting for payment. */
  payFirst?: boolean;
}) {
  if (orders.length < 2) return null;
  return (
    <Card className="mb-4">
      <p className="mb-2 text-sm font-semibold text-slate-800">Your orders</p>
      <ul className="flex flex-col gap-2">
        {orders.map((o, index) => {
          const awaiting = payFirst && (o.status === "open" || o.status === "billed") && o.itemCount > 0;
          const status = awaiting ? { tone: "amber" as const, label: "Awaiting payment" } : STATUS[o.status];
          const viewing = o.orderId === viewingId;
          return (
            <li key={o.orderId}>
              <button
                type="button"
                onClick={() => onSelect(o.orderId)}
                aria-current={viewing ? "true" : undefined}
                className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left ${
                  viewing ? "border-orange-400 bg-orange-50" : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900">
                    Order {index + 1}
                    {o.current ? " (latest)" : ""}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {o.itemCount} item{o.itemCount === 1 ? "" : "s"} · ₹{o.total.toFixed(2)}
                  </span>
                </span>
                <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                  {o.tokens.length > 0 && (
                    <span className="rounded-md bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-800">
                      Token {o.tokens.join(", ")}
                    </span>
                  )}
                  {o.ready && o.status !== "cancelled" && <Badge tone="green">Ready</Badge>}
                  {awaiting && !viewing && <span className="text-xs font-semibold text-orange-700">Pay now →</span>}
                  <Badge tone={status.tone}>{status.label}</Badge>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
