import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ITEM_CANCEL_REASON_LABELS, type ItemCancelReason, type OrderItem } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import ReasonDialog from "../../../shared/ui/ReasonDialog";
import { Badge, Button, Card, ErrorText } from "../../../shared/ui/ui";
import { useCancelOrderItem } from "../../orders/queries";
import { kitchenApi, openPdfInTab } from "../api";
import { useKotQueue, useMarkReady, usePrintKot, useServeItem, useStartPreparing } from "../queries";

const CANCEL_OPTIONS = (Object.keys(ITEM_CANCEL_REASON_LABELS) as ItemCancelReason[]).map((value) => ({
  value,
  label: ITEM_CANCEL_REASON_LABELS[value],
}));

function statusBadge(item: OrderItem): { tone: "gray" | "amber" | "blue" | "green"; label: string } {
  if (item.status === "preparing") return { tone: "blue", label: "Preparing" };
  if (item.status === "ready") return { tone: "green", label: "Ready to serve" };
  if (item.kotRound) return { tone: "amber", label: "Sent to kitchen" };
  return { tone: "gray", label: "New" };
}

export default function KotQueueView({ canCancel }: { canCancel: boolean }) {
  const [searchParams] = useSearchParams();
  const tableId = searchParams.get("tableId") || undefined;
  const queue = useKotQueue(tableId);
  const groups = queue.data ?? [];
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<OrderItem | null>(null);
  const error = actionError ?? (queue.error ? extractErrorMessage(queue.error) : null);

  const startPreparingItem = useStartPreparing();
  const markItemReady = useMarkReady();
  const serveItem = useServeItem();
  const cancelItem = useCancelOrderItem();
  const printTicket = usePrintKot();

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(extractErrorMessage(err));
    }
  }

  const startPreparing = (itemId: string) => run(() => startPreparingItem.mutateAsync(itemId));
  const markReady = (itemId: string) => run(() => markItemReady.mutateAsync(itemId));
  const serve = (itemId: string) => run(() => serveItem.mutateAsync(itemId));
  function cancelLine(item: OrderItem) {
    if (item.kotRound != null) {
      setCancelling(item);
      return;
    }
    if (!window.confirm(`Remove ${item.foodName} x${item.quantity} from this order?`)) return;
    run(() => cancelItem.mutateAsync({ itemId: item._id }));
  }

  function printKot(orderId: string) {
    const pdfTab = window.open("", "_blank");
    return run(async () => {
      try {
        const result = await printTicket.mutateAsync(orderId);
        if (!result.round) {
          pdfTab?.close();
          return;
        }
        await openPdfInTab(pdfTab, () => kitchenApi.kotPdf(orderId, result.round!));
      } catch (err) {
        pdfTab?.close();
        throw err;
      }
    });
  }

  function reprintKot(orderId: string, round: number) {
    const pdfTab = window.open("", "_blank");
    return run(() => openPdfInTab(pdfTab, () => kitchenApi.kotPdf(orderId, round)));
  }

  function printedRounds(items: OrderItem[]): { round: number; token: number | null }[] {
    const map = new Map<number, number | null>();
    for (const i of items) if (i.kotRound != null && !map.has(i.kotRound)) map.set(i.kotRound, i.tokenNumber);
    return Array.from(map, ([round, token]) => ({ round, token })).sort((a, b) => b.round - a.round);
  }

  return (
    <div className="flex flex-col gap-4">
      <ErrorText>{error}</ErrorText>
      {groups.length === 0 && <p className="text-sm text-slate-500">No pending kitchen items.</p>}
      {groups.map(({ order, items, tokenNumber }) => (
        <Card key={order._id}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {tokenNumber ? (
                <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-orange-600 font-bold leading-none text-white">
                  <span className="text-[9px] font-semibold opacity-80">TOKEN</span>
                  <span className="text-base">{tokenNumber}</span>
                </span>
              ) : (
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 text-[10px] font-semibold text-slate-400">
                  NEW
                </span>
              )}
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-800">
                  {order.orderType === "dine-in"
                    ? typeof order.tableId === "object" && order.tableId?.code
                      ? `Table: ${order.tableId.code}`
                      : "Counter"
                    : order.orderType === "takeaway"
                      ? "Take away"
                      : `Delivery: ${order.deliveryProvider}`}
                  {order.orderType !== "dine-in" && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-amber-900">
                      PACK
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500">{order.customerName}</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              {printedRounds(items).map((r) => (
                <Button
                  key={r.round}
                  variant="secondary"
                  className="shrink-0"
                  onClick={() => reprintKot(order._id, r.round)}
                  title="Reprint this ticket - keeps the same token"
                >
                  Reprint{r.token != null ? ` T${r.token}` : ""}
                </Button>
              ))}
              <Button className="shrink-0" onClick={() => printKot(order._id)}>
                Print KOT
              </Button>
            </div>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {items.map((item) => {
                const badge = statusBadge(item);
                return (
                  <tr key={item._id} className="border-t border-slate-100">
                    <td className="py-1.5">
                      {item.foodName} {item.isJain && "(Jain)"}
                      {(item.modifiers?.length || item.note) && (
                        <span className="mt-0.5 block text-xs font-semibold text-orange-700">
                          → {[...(item.modifiers?.map((m) => m.label) ?? []), item.note].filter(Boolean).join(", ")}
                        </span>
                      )}
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
                        <button className="text-red-600 hover:underline" onClick={() => cancelLine(item)}>
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
      <ReasonDialog
        open={cancelling !== null}
        title={cancelling ? `Cancel ${cancelling.foodName} x${cancelling.quantity}?` : ""}
        description="The kitchen already has this item, so the reason is recorded in the audit log."
        confirmLabel="Cancel item"
        danger
        options={CANCEL_OPTIONS}
        onCancel={() => setCancelling(null)}
        onConfirm={async ({ option, note }) => {
          await cancelItem.mutateAsync({ itemId: cancelling!._id, reason: option, note: note || undefined });
          setCancelling(null);
        }}
      />
    </div>
  );
}
