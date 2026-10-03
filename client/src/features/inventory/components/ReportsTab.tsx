import { useState } from "react";

import type { RecipeRow } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { MONEY, PERCENT, sheet } from "../../../shared/export/excel";
import { ExcelButton } from "../../../shared/ui/ExcelButton";
import { Card, ErrorText, Input, TableWrap } from "../../../shared/ui/ui";
import { daysAgo, isoDate, qty, rupees } from "../format";
import { useRecipes, useUsage } from "../queries";

const NO_ROWS: RecipeRow[] = [];

export function ReportsTab() {
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(isoDate(new Date()));
  const usage = useUsage({ from, to });
  const costed = (useRecipes().data ?? NO_ROWS)
    .filter((r) => r.recipe && r.costPercent !== null)
    .sort((a, b) => (b.costPercent ?? 0) - (a.costPercent ?? 0));

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Stock usage</h2>
            {usage.data && (
              <p className="text-sm text-slate-500">
                Used {rupees(usage.data.consumedValue)} · wasted{" "}
                <span className={usage.data.wastedValue > 0 ? "font-semibold text-red-600" : ""}>
                  {rupees(usage.data.wastedValue)}
                </span>
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <ExcelButton
              fileName={`stock-usage-${from}-to-${to}`}
              disabled={!usage.data}
              sheets={() => [
                sheet({
                  name: "Stock usage",
                  rows: usage.data?.lines ?? [],
                  columns: [
                    { header: "Item", value: (l) => l.name, width: 26 },
                    { header: "Unit", value: (l) => l.unit },
                    { header: "Bought", value: (l) => l.purchased },
                    { header: "Used", value: (l) => l.consumed },
                    { header: "Wasted", value: (l) => l.wasted },
                    { header: "Adjusted", value: (l) => l.adjusted },
                    {
                      header: "Used value",
                      value: (l) => l.consumedValue,
                      format: MONEY,
                      width: 12,
                    },
                    {
                      header: "Wasted value",
                      value: (l) => l.wastedValue,
                      format: MONEY,
                      width: 13,
                    },
                  ],
                }),
              ]}
            />
            <Input
              aria-label="From"
              type="date"
              className="!w-40"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <Input aria-label="To" type="date" className="!w-40" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <ErrorText>{usage.error ? extractErrorMessage(usage.error) : null}</ErrorText>
        <TableWrap>
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr>
                <th>Item</th>
                <th className="text-right">Bought</th>
                <th className="text-right">Used</th>
                <th className="text-right">Wasted</th>
                <th className="text-right">Adjusted</th>
                <th className="text-right">Used value</th>
                <th className="text-right">Wasted value</th>
              </tr>
            </thead>
            <tbody>
              {(usage.data?.lines ?? []).map((l) => (
                <tr key={l.stockItemId} className="border-t border-slate-100">
                  <td>{l.name}</td>
                  <td className="text-right tabular-nums">{l.purchased ? qty(l.purchased, l.unit) : "-"}</td>
                  <td className="text-right tabular-nums">{l.consumed ? qty(l.consumed, l.unit) : "-"}</td>
                  <td className={`py-1.5 text-right tabular-nums ${l.wasted ? "text-red-600" : ""}`}>
                    {l.wasted ? qty(l.wasted, l.unit) : "-"}
                  </td>
                  <td className="text-right tabular-nums">{l.adjusted ? qty(l.adjusted, l.unit) : "-"}</td>
                  <td className="text-right tabular-nums">{rupees(l.consumedValue)}</td>
                  <td className="text-right tabular-nums">{rupees(l.wastedValue)}</td>
                </tr>
              ))}
              {(usage.data?.lines ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                    No stock movements in these dates
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Food cost by dish</h2>
            <p className="text-sm text-slate-500">Recipe cost at today's average prices, against the menu price.</p>
          </div>
          <ExcelButton
            fileName="food-cost"
            disabled={costed.length === 0}
            sheets={() => [
              sheet({
                name: "Food cost",
                rows: costed,
                columns: [
                  { header: "Dish", value: (r) => r.name, width: 28 },
                  { header: "Price", value: (r) => r.price, format: MONEY },
                  { header: "Cost", value: (r) => r.cost, format: MONEY },
                  {
                    header: "Food cost",
                    value: (r) => (r.costPercent == null ? null : r.costPercent / 100),
                    format: PERCENT,
                  },
                ],
              }),
            ]}
          />
        </div>
        <TableWrap>
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr>
                <th>Dish</th>
                <th className="text-right">Price</th>
                <th className="text-right">Cost</th>
                <th className="text-right">Food cost</th>
                <th className="text-right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {costed.map((r) => (
                <tr key={r.foodItemId} className="border-t border-slate-100">
                  <td>{r.name}</td>
                  <td className="text-right tabular-nums">{rupees(r.price)}</td>
                  <td className="text-right tabular-nums">{rupees(r.cost)}</td>
                  <td
                    className={`py-1.5 text-right font-semibold tabular-nums ${
                      (r.costPercent ?? 0) > 40
                        ? "text-red-600"
                        : (r.costPercent ?? 0) > 30
                          ? "text-amber-700"
                          : "text-green-700"
                    }`}
                  >
                    {r.costPercent!.toFixed(1)}%
                  </td>
                  <td className="text-right tabular-nums">{rupees(r.price - r.cost)}</td>
                </tr>
              ))}
              {costed.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-sm text-slate-500">
                    Add recipes to see food cost
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </div>
  );
}
