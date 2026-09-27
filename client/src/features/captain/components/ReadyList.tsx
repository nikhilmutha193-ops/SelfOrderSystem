import { useState } from "react";

import type { KotQueueGroup } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { Button, ErrorText } from "../../../shared/ui/ui";
import { useServeItem } from "../../kitchen/queries";
import { tableCode } from "../tableCode";

export function ReadyList({ groups }: { groups: KotQueueGroup[] }) {
  const serve = useServeItem();
  const [error, setError] = useState<string | null>(null);
  const ready = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => i.status === "ready") }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-3 p-3">
      <ErrorText>{error}</ErrorText>
      {ready.length === 0 && (
        <p className="py-10 text-center text-sm text-slate-500">Nothing is waiting to be served.</p>
      )}
      {ready.map(({ order, items }) => (
        <div key={order._id} className="rounded-xl border border-green-200 bg-white p-3 shadow-sm">
          <p className="mb-2 font-semibold text-slate-800">
            {tableCode(order) ? `Table ${tableCode(order)}` : order.orderType === "takeaway" ? "Takeaway" : "Counter"}
            <span className="ml-2 text-sm font-normal text-slate-500">{order.customerName}</span>
          </p>
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li key={item._id} className="flex items-center justify-between gap-3">
                <span className="text-sm">
                  <span className="font-semibold">{item.quantity}×</span> {item.foodName}
                  {item.note && <span className="block text-xs text-slate-500">{item.note}</span>}
                </span>
                <Button
                  className="shrink-0 !bg-green-600 hover:!bg-green-700"
                  disabled={serve.isPending}
                  onClick={async () => {
                    setError(null);
                    try {
                      await serve.mutateAsync(item._id);
                    } catch (err) {
                      setError(extractErrorMessage(err));
                    }
                  }}
                >
                  Served
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
