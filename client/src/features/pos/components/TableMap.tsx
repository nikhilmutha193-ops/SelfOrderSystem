import { useEffect, useState } from "react";

import type { Area, PosTable } from "../../../lib/types";
import { withGuestState } from "../guestTable";

const RUNNING_LONG_MINUTES = 90;

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function minutesSince(iso: string | null, now: number) {
  return iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000)) : null;
}

function tableTone(table: PosTable, minutes: number | null) {
  if (table.status === "awaiting_payment") return "border-blue-400 bg-blue-50 text-blue-900";
  if (table.status === "occupied" && minutes !== null && minutes >= RUNNING_LONG_MINUTES) {
    return "border-red-400 bg-red-50 text-red-900";
  }
  if (table.status === "occupied") return "border-amber-400 bg-amber-50 text-amber-900";
  return "border-slate-200 bg-white text-slate-700";
}

function tableLabel(table: PosTable) {
  if (table.status === "awaiting_payment") return "Bill printed";
  if (table.status === "occupied") return table.isGuest ? "Open" : "Occupied";
  return table.isGuest ? "Walk-in" : "Free";
}

/** What is happening with the table's order(s), for the captain: the most urgent thing first. */
function orderStatus(table: PosTable): { label: string; className: string } | null {
  if (table.orders.length === 0) return null;
  const ready = table.orders.reduce((sum, o) => sum + o.ready, 0);
  const unsent = table.orders.reduce((sum, o) => sum + o.unsent, 0);
  if (ready > 0) return { label: `${ready} ready to serve`, className: "bg-green-600 text-white" };
  if (unsent > 0) return { label: `${unsent} not sent to kitchen`, className: "bg-slate-700 text-white" };
  if (table.orders.some((o) => o.status === "billed"))
    return { label: "Bill requested", className: "bg-blue-600 text-white" };
  return { label: "In the kitchen", className: "bg-amber-500 text-white" };
}

function groupByArea(all: PosTable[], areas: Area[]) {
  const guests = all.filter((t) => t.isGuest);
  const tables = all.filter((t) => !t.isGuest);
  const walkIn = guests.length > 0 ? [{ key: "walk-in", name: "Walk-in tables" as string | null, tables: guests }] : [];
  if (areas.length === 0)
    return [...walkIn, { key: "all", name: walkIn.length ? ("Tables" as string | null) : null, tables }];
  const known = new Set(areas.map((a) => a._id));
  const groups = areas.map((a) => ({
    key: a._id,
    name: a.name as string | null,
    tables: tables.filter((t) => t.areaId === a._id),
  }));
  const rest = tables.filter((t) => !t.areaId || !known.has(t.areaId));
  if (rest.length > 0) groups.push({ key: "none", name: "Other tables", tables: rest });
  return [...walkIn, ...groups].filter((g) => g.tables.length > 0);
}

export function TableMap({
  tables: rawTables,
  areas = [],
  onSelect,
  showOrderStatus = false,
}: {
  tables: PosTable[];
  areas?: Area[];
  onSelect: (table: PosTable) => void;
  /** Captain view: summary counts, order progress and the captain's name on each table. */
  showOrderStatus?: boolean;
}) {
  const now = useNow(30_000);
  const tables = rawTables.map(withGuestState);
  const groups = groupByArea(tables, areas);
  const counts = {
    free: tables.filter((t) => t.status === "available").length,
    occupied: tables.filter((t) => t.status === "occupied").length,
    awaiting: tables.filter((t) => t.status === "awaiting_payment").length,
    ready: tables.filter((t) => t.orders.some((o) => o.ready > 0)).length,
  };
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      {showOrderStatus && (
        <div className="grid grid-cols-4 gap-2 text-center text-xs font-medium">
          <span className="rounded-lg border border-slate-200 bg-white py-1.5 text-slate-700">
            <b className="block text-base tabular-nums">{counts.free}</b>Free
          </span>
          <span className="rounded-lg border border-amber-300 bg-amber-50 py-1.5 text-amber-900">
            <b className="block text-base tabular-nums">{counts.occupied}</b>Occupied
          </span>
          <span className="rounded-lg border border-blue-300 bg-blue-50 py-1.5 text-blue-900">
            <b className="block text-base tabular-nums">{counts.awaiting}</b>Bill
          </span>
          <span className="rounded-lg border border-green-300 bg-green-50 py-1.5 text-green-900">
            <b className="block text-base tabular-nums">{counts.ready}</b>To serve
          </span>
        </div>
      )}
      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded border border-slate-300 bg-white" /> Free
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded border border-amber-400 bg-amber-50" /> Occupied
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded border border-blue-400 bg-blue-50" /> Awaiting payment
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded border border-red-400 bg-red-50" /> Seated {RUNNING_LONG_MINUTES}+ min
        </span>
      </div>
      {groups.map((group) => (
        <section key={group.key} className="flex flex-col gap-2">
          {group.name && (
            <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              {group.name}
              <span className="font-normal normal-case">
                {group.tables.filter((t) => t.status !== "available").length}/{group.tables.length} busy
              </span>
            </h3>
          )}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
            {group.tables.map((table) => {
              const minutes = table.status === "available" ? null : minutesSince(table.occupiedAt, now);
              const total = table.orders.reduce((sum, o) => sum + o.total, 0);
              const ready = table.orders.reduce((sum, o) => sum + o.ready, 0);
              const progress = showOrderStatus ? orderStatus(table) : null;
              return (
                <button
                  key={table._id}
                  type="button"
                  data-table={table.code}
                  onClick={() => onSelect(table)}
                  className={`flex min-h-[96px] flex-col items-start justify-between rounded-xl border-2 p-3 text-left shadow-sm transition active:scale-[0.98] ${tableTone(table, minutes)}`}
                >
                  <span className="flex w-full items-start justify-between gap-1">
                    <span className="text-lg font-bold">{table.code}</span>
                    {ready > 0 && (
                      <span className="rounded-full bg-green-600 px-1.5 text-[10px] font-bold text-white">
                        {ready} ready
                      </span>
                    )}
                  </span>
                  <span className="text-xs font-medium">{tableLabel(table)}</span>
                  {progress && (
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${progress.className}`}>
                      {progress.label}
                    </span>
                  )}
                  {showOrderStatus && table.captainName && (
                    <span className="max-w-full truncate text-[10px] opacity-70">{table.captainName}</span>
                  )}
                  {table.orders.length > 0 && (
                    <span className="flex w-full justify-between text-xs tabular-nums">
                      <span>{minutes !== null ? `${minutes} min` : ""}</span>
                      <span className="font-semibold">₹{total.toFixed(0)}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {tables.length === 0 && <p className="text-sm text-slate-500">No tables yet. Add them under Tables.</p>}
    </div>
  );
}
