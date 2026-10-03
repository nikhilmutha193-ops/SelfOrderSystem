import { useState } from "react";

import type { StockCountRecord, StockItem } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { Button, Card, ErrorText, Input, TableWrap } from "../../../shared/ui/ui";
import { qty, rupees } from "../format";
import { useCounts, useCreateCount, useStockItems } from "../queries";

const NO_ITEMS: StockItem[] = [];
const NO_COUNTS: StockCountRecord[] = [];

export function CountsTab({ canEdit }: { canEdit: boolean }) {
  const items = (useStockItems().data ?? NO_ITEMS).filter((i) => i.isActive);
  const counts = useCounts().data ?? NO_COUNTS;
  const create = useCreateCount();
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const entered = Object.entries(counted).filter(([, v]) => v !== "");

  return (
    <div className="flex flex-col gap-4">
      {canEdit && (
        <Card>
          <h2 className="text-base font-semibold text-slate-900">Count stock</h2>
          <p className="mb-3 text-sm text-slate-500">
            Enter what you find on the shelf. Leave items you didn't count blank. Differences are posted as adjustments.
          </p>
          <TableWrap>
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="text-right">System stock</th>
                  <th className="text-right">Counted</th>
                  <th className="text-right">Difference</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const value = counted[item._id] ?? "";
                  const diff = value === "" ? null : Number(value) - item.onHand;
                  return (
                    <tr key={item._id} className="border-t border-slate-100">
                      <td>{item.name}</td>
                      <td className="text-right tabular-nums">{qty(item.onHand, item.unit)}</td>
                      <td className="text-right">
                        <Input
                          aria-label={`Counted ${item.name}`}
                          className="!w-28 text-right"
                          type="number"
                          min={0}
                          step="any"
                          value={value}
                          onChange={(e) =>
                            setCounted((c) => ({
                              ...c,
                              [item._id]: e.target.value,
                            }))
                          }
                        />
                      </td>
                      <td
                        className={`py-1.5 text-right tabular-nums ${
                          diff === null
                            ? "text-slate-300"
                            : diff < 0
                              ? "text-red-600"
                              : diff > 0
                                ? "text-amber-700"
                                : "text-green-700"
                        }`}
                      >
                        {diff === null ? "-" : qty(diff, item.unit)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <Input
              className="!w-72"
              placeholder="Note, e.g. Sunday night count"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button
              type="button"
              disabled={create.isPending || entered.length === 0}
              onClick={async () => {
                setError(null);
                try {
                  await create.mutateAsync({
                    note: note.trim() || undefined,
                    lines: entered.map(([stockItemId, v]) => ({
                      stockItemId,
                      counted: Number(v),
                    })),
                  });
                  setCounted({});
                  setNote("");
                } catch (err) {
                  setError(extractErrorMessage(err));
                }
              }}
            >
              Save count ({entered.length})
            </Button>
          </div>
          <ErrorText>{error}</ErrorText>
        </Card>
      )}

      <Card>
        <h2 className="mb-4 text-base font-semibold text-slate-900">Past counts</h2>
        {counts.length === 0 && <p className="text-sm text-slate-400">No counts yet.</p>}
        <ul className="flex flex-col divide-y divide-slate-100">
          {counts.map((count) => (
            <li key={count._id} className="py-2">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 text-left text-sm"
                onClick={() => setOpenId(openId === count._id ? null : count._id)}
              >
                <span>
                  {new Date(count.countedAt).toLocaleString([], {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  <span className="text-slate-500">
                    {" "}
                    · {count.lines.length} items
                    {count.note ? ` · ${count.note}` : ""}
                    {count.byName ? ` · ${count.byName}` : ""}
                  </span>
                </span>
                <span
                  className={`font-semibold tabular-nums ${count.varianceValue < 0 ? "text-red-600" : "text-slate-700"}`}
                >
                  {rupees(count.varianceValue)}
                </span>
              </button>
              {openId === count._id && (
                <table className="mt-2 w-full text-xs">
                  <tbody>
                    {count.lines.map((l) => (
                      <tr key={l.stockItemId} className="border-t border-slate-100">
                        <td>{l.name}</td>
                        <td className="text-right tabular-nums">expected {qty(l.expected, l.unit)}</td>
                        <td className="text-right tabular-nums">counted {qty(l.counted, l.unit)}</td>
                        <td className={`py-1 text-right tabular-nums ${l.variance < 0 ? "text-red-600" : ""}`}>
                          {qty(l.variance, l.unit)} ({rupees(l.value)})
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
