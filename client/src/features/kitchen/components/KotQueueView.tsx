import { ChefHat, ChevronsDownUp, ChevronsUpDown, SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  ITEM_CANCEL_REASON_LABELS,
  type ItemCancelReason,
  type KotQueueGroup,
  type OrderItem,
} from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { confirmDialog } from "../../../shared/ui/confirm";
import { usePageTour, type TourStep } from "../../../shared/ui/PageTour";
import ReasonDialog from "../../../shared/ui/ReasonDialog";
import { Alert, Card, EmptyState, ErrorText, IconButton, Tabs } from "../../../shared/ui/ui";
import { useCancelOrderItem } from "../../orders/queries";
import { useMyStation, usePrintingStatus } from "../../printing/queries";
import { kitchenApi, openPdfInTab } from "../api";
import {
  balanceColumns,
  itemFilter,
  loadCollapsed,
  saveCollapsed,
  ticketCounts,
  useColumnCount,
  type QueueFilter,
} from "../kds";
import { useKotQueue, useMarkReady, usePrintKot, useServeItem, useStartPreparing } from "../queries";
import { KotTicket, type TicketActions } from "./KotTicket";

const CANCEL_OPTIONS = (Object.keys(ITEM_CANCEL_REASON_LABELS) as ItemCancelReason[]).map((value) => ({
  value,
  label: ITEM_CANCEL_REASON_LABELS[value],
}));

const NO_GROUPS: KotQueueGroup[] = [];

const FILTER_EMPTY: Record<QueueFilter, string> = {
  all: "",
  waiting: "No tickets are waiting to be started.",
  cooking: "Nothing is cooking right now.",
  ready: "No dishes are waiting to be served.",
  unsent: "Every order has been sent to the kitchen.",
};

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
  const groups = queue.data ?? NO_GROUPS;
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<OrderItem | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, true>>(loadCollapsed);
  const { ref: boardRef, columns } = useColumnCount(330, 5);
  const error = actionError ?? (queue.error ? extractErrorMessage(queue.error) : null);

  const startPreparingItem = useStartPreparing();
  const markItemReady = useMarkReady();
  const serveItem = useServeItem();
  const cancelItem = useCancelOrderItem();
  const printTicket = usePrintKot();

  function updateCollapsed(next: Record<string, true>) {
    setCollapsed(next);
    saveCollapsed(next);
  }

  function toggleTicket(orderId: string) {
    const next = { ...collapsed };
    if (next[orderId]) delete next[orderId];
    else next[orderId] = true;
    updateCollapsed(next);
  }

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    setNotice(null);
    try {
      await action();
    } catch (err) {
      setActionError(extractErrorMessage(err));
    }
  }

  async function cancelLine(item: OrderItem) {
    if (item.kotRound != null) {
      setCancelling(item);
      return;
    }
    if (
      !(await confirmDialog({
        title: `Remove ${item.foodName} ×${item.quantity}?`,
        message: "It hasn't been sent to the kitchen, so it is simply taken off the order.",
        confirmLabel: "Remove item",
        cancelLabel: "Keep item",
      }))
    )
      return;
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

  const actions: TicketActions = {
    start: (item) => run(() => startPreparingItem.mutateAsync(item._id)),
    ready: (item) => run(() => markItemReady.mutateAsync(item._id)),
    serve: (item) => run(() => serveItem.mutateAsync(item._id)),
    cancel: (item) => void cancelLine(item),
    bulk: (kind, items) =>
      run(async () => {
        const mutate =
          kind === "start"
            ? startPreparingItem.mutateAsync
            : kind === "ready"
              ? markItemReady.mutateAsync
              : serveItem.mutateAsync;
        for (const item of items) await mutate(item._id);
      }),
    send: (orderId) => printKot(orderId),
    reprint: (orderId, round) => void reprintKot(orderId, round),
  };

  const totals = { waiting: 0, cooking: 0, ready: 0, unsent: 0 };
  for (const group of groups) {
    const c = ticketCounts(group.items);
    totals.waiting += c.waiting;
    totals.cooking += c.cooking;
    totals.ready += c.ready;
    totals.unsent += c.unsent;
  }

  const shown = filter === "all" ? groups : groups.filter((g) => g.items.some((i) => itemFilter(i) === filter));
  const laidOut = balanceColumns(shown, columns, (g) =>
    collapsed[g.order._id]
      ? 2
      : 3 + (filter === "all" ? g.items.length : g.items.filter((i) => itemFilter(i) === filter).length)
  );

  const filterItems: { value: QueueFilter; label: string; count?: number }[] = [
    { value: "all", label: "All tickets", count: groups.length },
    { value: "waiting", label: "Waiting", count: totals.waiting },
    { value: "cooking", label: "Cooking", count: totals.cooking },
    { value: "ready", label: "Ready", count: totals.ready },
  ];
  if (totals.unsent > 0 || filter === "unsent") {
    filterItems.push({ value: "unsent", label: "Not sent", count: totals.unsent });
  }

  const updated = queue.dataUpdatedAt
    ? new Date(queue.dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  const tourSteps: TourStep[] = useMemo(
    () => [
      ...(stations.length > 0
        ? [
            {
              target: "kot-stations",
              title: "Filter by station",
              description: "Show tickets for one kitchen station only, or all of them.",
            },
          ]
        : []),
      {
        target: "kot-grid",
        title: "Tickets",
        description:
          "Each card is one order's kitchen ticket. Move an item from Start → Ready → Served as it cooks, reprint a round, or cancel an item. Collapse-all/expand-all is above, or click a ticket's header to toggle it on its own.",
      },
    ],
    [stations.length]
  );
  usePageTour(tourSteps);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-2 shadow-card sm:p-3 lg:flex-row lg:items-center">
        <Tabs className="min-w-0 lg:flex-1" value={filter} onChange={setFilter} items={filterItems} />
        <div className="flex items-center justify-between gap-2 px-1 lg:justify-end">
          <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-500" aria-live="polite">
            <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
              {!queue.error && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              )}
              <span
                className={`relative inline-flex h-2.5 w-2.5 rounded-full ${queue.error ? "bg-red-500" : "bg-emerald-500"}`}
              />
            </span>
            {queue.error ? "Offline" : "Live"}
            {updated && <span className="hidden text-slate-400 sm:inline">· {updated}</span>}
          </span>
          {groups.length > 1 && (
            <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
              <IconButton
                size="sm"
                icon={ChevronsDownUp}
                label="Collapse all tickets"
                onClick={() => {
                  const next = { ...collapsed };
                  for (const g of groups) next[g.order._id] = true;
                  updateCollapsed(next);
                }}
              />
              <IconButton
                size="sm"
                icon={ChevronsUpDown}
                label="Expand all tickets"
                onClick={() => {
                  const next = { ...collapsed };
                  for (const g of groups) delete next[g.order._id];
                  updateCollapsed(next);
                }}
              />
            </div>
          )}
        </div>
      </div>

      {stations.length > 0 && (
        <div data-tour="kot-stations">
          <Tabs
            size="sm"
            value={stationId ?? "all"}
            onChange={(v) => setChosenStation(v === "all" ? "" : v)}
            items={[{ value: "all", label: "All stations" }, ...stations.map((s) => ({ value: s._id, label: s.name }))]}
          />
        </div>
      )}

      {notice && (
        <Alert tone="success" onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      <ErrorText>{error}</ErrorText>

      {groups.length === 0 && !queue.isLoading && (
        <Card>
          <EmptyState
            icon={ChefHat}
            title="All caught up"
            description="New tickets appear here as soon as they're sent."
          />
        </Card>
      )}
      {groups.length > 0 && shown.length === 0 && (
        <Card>
          <EmptyState icon={SearchX} title="Nothing here" description={FILTER_EMPTY[filter]} />
        </Card>
      )}

      <div
        ref={boardRef}
        className="grid items-start gap-4"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        data-tour="kot-grid"
      >
        {laidOut.map((column, index) => (
          <div key={index} className="flex min-w-0 flex-col gap-4">
            {column.map((group) => (
              <KotTicket
                key={group.order._id}
                group={group}
                filter={filter}
                collapsed={Boolean(collapsed[group.order._id])}
                onToggle={() => toggleTicket(group.order._id)}
                canCancel={canCancel}
                actions={actions}
              />
            ))}
          </div>
        ))}
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
