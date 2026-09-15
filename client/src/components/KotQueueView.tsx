import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, extractErrorMessage } from "../lib/apiClient";
import { Badge, Button, Card, ErrorText } from "./ui";
import type { KotQueueGroup, OrderItem } from "../lib/types";

function statusBadge(item: OrderItem): { tone: "gray" | "amber" | "blue" | "green"; label: string } {
  if (item.status === "preparing") return { tone: "blue", label: "Preparing" };
  if (item.status === "ready") return { tone: "green", label: "Ready to serve" };
  if (item.kotRound) return { tone: "amber", label: "Sent to kitchen" };
  return { tone: "gray", label: "New" };
}

export default function KotQueueView({ canCancel }: { canCancel: boolean }) {
  const [searchParams] = useSearchParams();
  const tableId = searchParams.get("tableId") || undefined;
  const [groups, setGroups] = useState<KotQueueGroup[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<KotQueueGroup[]>("/orders/kot/queue", { params: tableId ? { tableId } : undefined })
      .then((res) => setGroups(res.data))
      .catch((err) => setError(extractErrorMessage(err)));
  }, [tableId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 6000);
    return () => clearInterval(interval);
  }, [load]);

  async function startPreparing(itemId: string) {
    try {
      await api.patch(`/orders/items/${itemId}/preparing`);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function markReady(itemId: string) {
    try {
      await api.patch(`/orders/items/${itemId}/ready`);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function serve(itemId: string) {
    try {
      await api.patch(`/orders/items/${itemId}/serve`);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function cancelLine(itemId: string) {
    try {
      await api.patch(`/orders/items/${itemId}/cancel`);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function printKot(orderId: string) {
    // Open the tab synchronously, inside the click handler, so browsers still
    // treat it as user-initiated - opening it after the awaited requests below
    // would fall outside the user-gesture window and get popup-blocked.
    const pdfTab = window.open("", "_blank");
    try {
      const res = await api.post(`/orders/${orderId}/kot/print`);
      if (res.data.round) {
        const pdfRes = await api.get(`/orders/${orderId}/kot/${res.data.round}/pdf`, { responseType: "blob" });
        const url = URL.createObjectURL(pdfRes.data);
        if (pdfTab) pdfTab.location.href = url;
      } else {
        pdfTab?.close();
      }
      load();
    } catch (err) {
      pdfTab?.close();
      setError(extractErrorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ErrorText>{error}</ErrorText>
      {groups.length === 0 && <p className="text-sm text-slate-500">No pending kitchen items.</p>}
      {groups.map(({ order, items }) => (
        <Card key={order._id}>
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-800">
                {order.orderType === "dine-in"
                  ? `Table: ${typeof order.tableId === "object" ? order.tableId.code : ""}`
                  : `Delivery: ${order.deliveryProvider}`}
              </p>
              <p className="text-xs text-slate-500">{order.customerName}</p>
            </div>
            <Button onClick={() => printKot(order._id)}>Print KOT</Button>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {items.map((item) => {
                const badge = statusBadge(item);
                return (
                  <tr key={item._id} className="border-t border-slate-100">
                    <td className="py-1.5">
                      {item.foodName} {item.isJain && "(Jain)"}
                    </td>
                    <td className="py-1.5">x{item.quantity}</td>
                    <td className="py-1.5">
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                    </td>
                    <td className="flex flex-wrap gap-2 py-1.5">
                      {item.status === "pending" && item.kotRound && (
                        <button className="text-blue-700 hover:underline" onClick={() => startPreparing(item._id)}>
                          Start preparing
                        </button>
                      )}
                      {item.status === "preparing" && (
                        <button className="text-green-700 hover:underline" onClick={() => markReady(item._id)}>
                          Mark ready
                        </button>
                      )}
                      <button className="text-green-700 hover:underline" onClick={() => serve(item._id)}>
                        Mark served
                      </button>
                      {canCancel && (
                        <button className="text-red-600 hover:underline" onClick={() => cancelLine(item._id)}>
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ))}
    </div>
  );
}
