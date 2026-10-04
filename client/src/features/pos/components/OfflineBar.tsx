import { CloudOff, CloudUpload, ListChecks, Printer, RefreshCw, Trash2, Wifi } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import type { PosBilling } from "../../../lib/types";
import { confirmDialog } from "../../../shared/ui/confirm";
import { Dialog } from "../../../shared/ui/Dialog";
import { Badge, Button, EmptyState, IconButton } from "../../../shared/ui/ui";
import {
  offlineTotals,
  removeOfflineSale,
  retryOfflineSale,
  syncOfflineSales,
  useOfflineSales,
  type OfflineSale,
} from "../offline";
import { printHtml, receiptHtml } from "../offlinePrint";

const STATE_BADGE = {
  open: { tone: "amber", label: "Open" },
  waiting: { tone: "blue", label: "Waiting to sync" },
  synced: { tone: "green", label: "Synced" },
  attention: { tone: "red", label: "Needs attention" },
} as const;

function place(sale: OfflineSale) {
  return sale.orderType === "takeaway" ? "Takeaway" : `Table ${sale.tableCode ?? ""}`.trim();
}

function SalesDialog({
  billing,
  canSync,
  onClose,
  onSynced,
}: {
  billing: PosBilling | undefined;
  canSync: boolean;
  onClose: () => void;
  onSynced: () => void;
}) {
  const sales = [...useOfflineSales()].reverse();
  const [syncing, setSyncing] = useState(false);

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="Offline bills"
      description="Bills taken while offline stay on this device until they sync. Synced bills are listed for a day."
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            type="button"
            icon={CloudUpload}
            loading={syncing}
            disabled={!canSync || !sales.some((s) => s.state === "waiting")}
            onClick={async () => {
              setSyncing(true);
              try {
                await syncOfflineSales();
                onSynced();
              } finally {
                setSyncing(false);
              }
            }}
          >
            Sync now
          </Button>
        </>
      }
    >
      {sales.length === 0 ? (
        <EmptyState icon={ListChecks} title="No offline bills" description="Everything is on the server." />
      ) : (
        <ul className="flex flex-col divide-y divide-slate-100" data-testid="offline-sales">
          {sales.map((sale) => {
            const badge = STATE_BADGE[sale.state];
            const total =
              sale.state === "open" ? offlineTotals(sale.lines, sale.orderType, billing).grandTotal : sale.clientTotal;
            return (
              <li key={sale.clientId} className="flex flex-col gap-1.5 py-3" data-offline-sale={sale.clientId}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">
                      {place(sale)}
                      {sale.customerName && <span className="font-normal text-slate-500"> · {sale.customerName}</span>}
                    </p>
                    <p className="text-xs text-slate-500">
                      {new Date(sale.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} · Ref{" "}
                      {sale.clientId.slice(-6).toUpperCase()} · {sale.lines.reduce((sum, l) => sum + l.quantity, 0)}{" "}
                      items
                      {sale.payments.length === 0 && sale.state !== "open" && " · unpaid"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900 tabular-nums">₹{total.toFixed(2)}</span>
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  </div>
                </div>
                {sale.result && (
                  <p className="text-sm text-slate-600">
                    Bill{" "}
                    <Link
                      className="font-medium text-orange-700 hover:underline"
                      to={`/admin/orders/${sale.result.orderId}`}
                    >
                      {sale.result.invoiceNumber ?? "order"}
                    </Link>
                    {sale.result.grandTotal != null && ` · ₹${sale.result.grandTotal.toFixed(2)}`}
                    {sale.result.status === "closed" ? " · paid" : " · not paid yet"}
                  </p>
                )}
                {(sale.error || sale.result?.note) && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    {sale.error ?? sale.result?.note}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {sale.state !== "open" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      icon={Printer}
                      onClick={() =>
                        printHtml(receiptHtml(sale, offlineTotals(sale.lines, sale.orderType, billing), billing))
                      }
                    >
                      Print again
                    </Button>
                  )}
                  {sale.state === "attention" && sale.error && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      icon={RefreshCw}
                      onClick={() => retryOfflineSale(sale.clientId)}
                    >
                      Try again
                    </Button>
                  )}
                  {sale.state !== "waiting" && (
                    <IconButton
                      icon={Trash2}
                      label={`Remove offline bill ${sale.clientId.slice(-6).toUpperCase()}`}
                      className="!text-red-600 hover:!bg-red-50"
                      onClick={async () => {
                        const unsent = sale.state === "open" || (sale.state === "attention" && !sale.result);
                        if (
                          unsent &&
                          !(await confirmDialog({
                            title: "Remove this offline bill?",
                            message: "It was never saved on the server, so it won't appear in sales or reports.",
                            confirmLabel: "Remove",
                          }))
                        )
                          return;
                        removeOfflineSale(sale.clientId);
                      }}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}

export function OfflineBar({
  offline,
  forced,
  billing,
  onReconnect,
  onSynced,
}: {
  offline: boolean;
  forced: boolean;
  billing: PosBilling | undefined;
  onReconnect: () => void;
  onSynced: () => void;
}) {
  const sales = useOfflineSales();
  const [open, setOpen] = useState(false);
  const waiting = sales.filter((s) => s.state === "waiting").length;
  const attention = sales.filter((s) => s.state === "attention").length;
  const openSales = sales.filter((s) => s.state === "open").length;
  const pending = waiting + attention + openSales;

  return (
    <>
      {offline || pending > 0 ? (
        <div
          role="status"
          data-testid="offline-bar"
          className={`flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 text-sm ${
            offline
              ? "bg-amber-100 text-amber-900"
              : attention > 0
                ? "bg-red-50 text-red-800"
                : "bg-blue-50 text-blue-900"
          }`}
        >
          {offline ? <CloudOff size={16} aria-hidden="true" /> : <CloudUpload size={16} aria-hidden="true" />}
          <span className="min-w-0 flex-1">
            {offline ? (
              <>
                <span className="font-semibold">Offline billing.</span> New bills are kept on this device and sync when
                the connection is back.
              </>
            ) : (
              <span className="font-semibold">Back online.</span>
            )}
            {pending > 0 && (
              <span className="ml-1">
                {[
                  openSales > 0 && `${openSales} open`,
                  waiting > 0 && `${waiting} waiting to sync`,
                  attention > 0 && `${attention} need attention`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            )}
          </span>
          {offline && forced && (
            <button
              type="button"
              className="inline-flex items-center gap-1 font-semibold underline"
              onClick={onReconnect}
            >
              <Wifi size={14} aria-hidden="true" />
              Try to reconnect
            </button>
          )}
          <button type="button" className="font-semibold underline" onClick={() => setOpen(true)}>
            Offline bills ({sales.length})
          </button>
        </div>
      ) : null}
      {open && (
        <SalesDialog
          billing={billing}
          canSync={!offline || !forced}
          onClose={() => setOpen(false)}
          onSynced={onSynced}
        />
      )}
    </>
  );
}
