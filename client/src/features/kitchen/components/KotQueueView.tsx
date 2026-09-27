import { Check, ChefHat, CookingPot, Flame, HandPlatter, Printer, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ITEM_CANCEL_REASON_LABELS, type ItemCancelReason, type OrderItem } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import ReasonDialog from "../../../shared/ui/ReasonDialog";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorText,
  IconButton,
  Tabs,
  type BadgeTone,
} from "../../../shared/ui/ui";
import { useCancelOrderItem } from "../../orders/queries";
import { useMyStation, usePrintingStatus } from "../../printing/queries";
import { kitchenApi, openPdfInTab } from "../api";
import { useKotQueue, useMarkReady, usePrintKot, useServeItem, useStartPreparing } from "../queries";

const CANCEL_OPTIONS = (Object.keys(ITEM_CANCEL_REASON_LABELS) as ItemCancelReason[]).map((value) => ({
  value,
  label: ITEM_CANCEL_REASON_LABELS[value],
}));

function statusBadge(item: OrderItem): { tone: BadgeTone; label: string } {
  if (item.status === "preparing") return { tone: "blue", label: "Preparing" };
  if (item.status === "ready") return { tone: "green", label: "Ready to serve" };
  if (item.kotRound) return { tone: "amber", label: "Sent to kitchen" };
  return { tone: "gray", label: "New" };
}

export default function KotQueueView({ canCancel }: { canCancel: boolean }) {
  const [searchParams] = useSearchParams();
  const tableId = searchParams.get("tableId") || undefined;
  const myStation = useMyStation();
  const printing = usePrintingStatus();
  const usePrinters = printing.data?.printersConfigured ?? false;
  const stations = myStation.data?.stations ?? [];
  const [chosenStation, setChosenStation] = useState<string | null>(null);
  const stationId = (chosenStation ?? myStation.data?.stationId ?? "") || undefined;
  const queue = useKotQueue(tableId, stationId);
  const [notice, setNotice] = useState<string | null>(null);
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
    setNotice(null);
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
    if (usePrinters) {
      return run(async () => {
        const result = await printTicket.mutateAsync(orderId);
        setNotice(result.round ? `KOT T${result.tokenNumber} sent to the kitchen printers` : (result.message ?? null));
      });
    }
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
    if (usePrinters) {
      return run(async () => {
        await kitchenApi.reprintKot(orderId, round);
        setNotice("Reprint sent to the kitchen printers");
      });
    }
    const pdfTab = window.open("", "_blank");
    return run(() => openPdfInTab(pdfTab, () => kitchenApi.kotPdf(orderId, round)));
  }

  function printedRounds(items: OrderItem[]): { round: number; token: number | null }[] {
    const map = new Map<number, number | null>();
    for (const i of items) if (i.kotRound != null && !map.has(i.kotRound)) map.set(i.kotRound, i.tokenNumber);
    return Array.from(map, ([round, token]) => ({ round, token })).sort((a, b) => b.round - a.round);
  }

  function orderTitle(order: (typeof groups)[number]["order"]) {
    if (order.orderType === "dine-in") {
      return typeof order.tableId === "object" && order.tableId?.code ? `Table ${order.tableId.code}` : "Counter";
    }
    return order.orderType === "takeaway" ? "Take away" : `Delivery · ${order.deliveryProvider}`;
  }

  return (
    <div className="flex flex-col gap-4">
      {stations.length > 0 && (
        <Tabs
          value={stationId ?? "all"}
          onChange={(v) => setChosenStation(v === "all" ? "" : v)}
          items={[{ value: "all", label: "All stations" }, ...stations.map((s) => ({ value: s._id, label: s.name }))]}
        />
      )}
      {notice && (
        <Alert tone="success" onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      <ErrorText>{error}</ErrorText>
      {groups.length === 0 && (
        <Card>
          <EmptyState
            icon={ChefHat}
            title="All caught up"
            description="New tickets appear here as soon as they're sent."
          />
        </Card>
      )}
      <div className="grid items-start gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {groups.map(({ order, items, tokenNumber }) => {
          const rounds = printedRounds(items);
          const packed = order.orderType !== "dine-in";
          return (
            <Card key={order._id} padding="none" className="overflow-hidden">
              <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                {tokenNumber ? (
                  <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-orange-600 leading-none font-bold text-white">
                    <span className="text-[9px] font-semibold opacity-80">TOKEN</span>
                    <span className="text-lg">{tokenNumber}</span>
                  </span>
                ) : (
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-slate-300 text-[10px] font-bold text-slate-400">
                    NEW
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                    {orderTitle(order)}
                    {packed && <Badge tone="amber">Pack</Badge>}
                  </p>
                  <p className="truncate text-xs text-slate-500">{order.customerName}</p>
                </div>
                <Button size="sm" icon={Printer} onClick={() => printKot(order._id)}>
                  Print KOT
                </Button>
              </div>

              <ul className="divide-y divide-slate-100">
                {items.map((item) => {
                  const badge = statusBadge(item);
                  const extras = [...(item.modifiers?.map((m) => m.label) ?? []), item.note].filter(Boolean).join(", ");
                  return (
                    <li key={item._id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 px-1.5 text-sm font-bold text-slate-800 tabular-nums">
                          {item.quantity}×
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">
                            {item.foodName}
                            {item.isJain && <span className="ml-1 text-xs font-semibold text-emerald-700">Jain</span>}
                          </p>
                          {extras && <p className="text-xs font-semibold text-orange-700">→ {extras}</p>}
                          <div className="mt-1">
                            <Badge tone={badge.tone} dot>
                              {badge.label}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5 pl-11 sm:pl-0">
                        {item.status === "pending" && item.kotRound && (
                          <Button size="sm" variant="secondary" icon={Flame} onClick={() => startPreparing(item._id)}>
                            Start
                          </Button>
                        )}
                        {item.status === "preparing" && (
                          <Button size="sm" variant="success" icon={Check} onClick={() => markReady(item._id)}>
                            Ready
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant={item.status === "ready" ? "success" : "ghost"}
                          icon={HandPlatter}
                          onClick={() => serve(item._id)}
                        >
                          Served
                        </Button>
                        {canCancel && (
                          <IconButton
                            size="sm"
                            icon={X}
                            label={`Cancel ${item.foodName}`}
                            className="!text-red-600 hover:!bg-red-50"
                            onClick={() => cancelLine(item)}
                          />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

              {rounds.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-2.5">
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
                    <CookingPot size={14} aria-hidden="true" />
                    Reprint
                  </span>
                  {rounds.map((r) => (
                    <Button
                      key={r.round}
                      size="sm"
                      variant="secondary"
                      icon={RotateCcw}
                      onClick={() => reprintKot(order._id, r.round)}
                      title="Reprint this ticket - keeps the same token"
                    >
                      {r.token != null ? `T${r.token}` : `Round ${r.round}`}
                    </Button>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
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
