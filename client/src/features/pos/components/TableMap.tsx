import { useEffect, useState } from "react";

import type { PosTable } from "../../../lib/types";

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
  if (table.status === "occupied") return "Occupied";
  return "Free";
}

export function TableMap({ tables, onSelect }: { tables: PosTable[]; onSelect: (table: PosTable) => void }) {
  const now = useNow(30_000);
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
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
      <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
        {tables.map((table) => {
          const minutes = table.status === "available" ? null : minutesSince(table.occupiedAt, now);
          const total = table.orders.reduce((sum, o) => sum + o.total, 0);
          const ready = table.orders.reduce((sum, o) => sum + o.ready, 0);
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
      {tables.length === 0 && <p className="text-sm text-slate-500">No tables yet. Add them under Tables.</p>}
    </div>
  );
}
