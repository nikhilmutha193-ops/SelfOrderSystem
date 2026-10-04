import { CircleHelp, Lightbulb, Puzzle, Star, ThumbsDown, Wrench, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { DishClass, DishInsight, MenuEngineeringReport } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { MONEY, PERCENT, sheet } from "../../../shared/export/excel";
import { ExcelButton } from "../../../shared/ui/ExcelButton";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ErrorText,
  Skeleton,
  TableWrap,
  type BadgeTone,
} from "../../../shared/ui/ui";
import { useMenuEngineering } from "../queries";

const CLASS_INFO: Record<DishClass, { label: string; icon: LucideIcon; tone: BadgeTone; advice: string }> = {
  star: {
    label: "Stars",
    icon: Star,
    tone: "green",
    advice: "Popular and profitable. Keep the recipe and price steady and give them the best spot on the menu.",
  },
  workhorse: {
    label: "Workhorses",
    icon: Wrench,
    tone: "amber",
    advice: "Sell well but earn little per plate. Try a small price rise, a smaller portion or cheaper ingredients.",
  },
  puzzle: {
    label: "Puzzles",
    icon: Puzzle,
    tone: "blue",
    advice: "Earn well but don't sell. Rename, photograph, move higher on the menu, or have staff recommend them.",
  },
  dog: {
    label: "Dogs",
    icon: ThumbsDown,
    tone: "red",
    advice: "Low sales and low margin. Rework them or take them off the menu to simplify the kitchen.",
  },
  unknown: {
    label: "Needs a recipe",
    icon: CircleHelp,
    tone: "gray",
    advice: "Add a recipe under Inventory so the cost per plate is known.",
  },
};

const ORDER: DishClass[] = ["star", "workhorse", "puzzle", "dog"];
const rupee = (n: number) => `₹${n.toFixed(2)}`;
const rupee0 = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

function niceMax(value: number) {
  if (value <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(value)));
  const n = value / exp;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * exp;
}

function ticks(max: number, count = 4) {
  return Array.from({ length: count + 1 }, (_, i) => (max / count) * i);
}

function QuadrantChart({ report }: { report: MenuEngineeringReport }) {
  const { ref, width } = useWidth();
  const [hover, setHover] = useState<DishInsight | null>(null);
  const points = report.dishes.filter((d) => d.margin != null);
  const height = width < 520 ? 300 : 360;
  const pad = { top: 20, right: 20, bottom: 44, left: 56 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const xMax = niceMax(Math.max(1, ...points.map((d) => d.quantity)) * 1.1);
  const margins = points.map((d) => d.margin!);
  const yMax = niceMax(Math.max(1, ...margins) * 1.1);
  const yMin = Math.min(0, ...margins) < 0 ? -niceMax(-Math.min(...margins) * 1.1) : 0;
  const x = (v: number) => pad.left + (v / xMax) * plotW;
  const y = (v: number) => pad.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const popularQty = (report.thresholds.popularityMixPercent / 100) * report.totals.quantity;
  const avgMargin = report.thresholds.avgMargin;
  const labelled = new Set(
    [...points]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, width < 520 ? 3 : 6)
      .map((d) => d.foodItemId)
  );

  if (points.length === 0) {
    return (
      <EmptyState
        icon={CircleHelp}
        title="No recipes yet"
        description="Add recipes under Inventory so each dish's cost per plate is known, then the chart fills in."
      />
    );
  }

  const quadrantLabel = (text: string, qx: number, qy: number, anchor: "start" | "end") => (
    <text
      x={qx}
      y={qy}
      textAnchor={anchor}
      className="fill-slate-400 text-[11px] font-semibold tracking-wide uppercase"
    >
      {text}
    </text>
  );
  const splitX = x(Math.min(popularQty, xMax));
  const splitY = avgMargin == null ? null : y(avgMargin);

  return (
    <div ref={ref} className="relative w-full">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Popularity versus profit per plate for ${points.length} dishes. The table below lists every value.`}
        className="block overflow-visible"
      >
        {ticks(yMax - yMin).map((t) => {
          const v = yMin + t;
          return (
            <g key={`y${t}`}>
              <line x1={pad.left} x2={pad.left + plotW} y1={y(v)} y2={y(v)} className="stroke-slate-100" />
              <text
                x={pad.left - 8}
                y={y(v)}
                dy="0.32em"
                textAnchor="end"
                className="fill-slate-400 text-[11px] tabular-nums"
              >
                {rupee0(v)}
              </text>
            </g>
          );
        })}
        {ticks(xMax).map((t) => (
          <text
            key={`x${t}`}
            x={x(t)}
            y={pad.top + plotH + 18}
            textAnchor="middle"
            className="fill-slate-400 text-[11px] tabular-nums"
          >
            {Math.round(t)}
          </text>
        ))}
        <line x1={pad.left} x2={pad.left + plotW} y1={y(yMin)} y2={y(yMin)} className="stroke-slate-300" />
        <text
          x={pad.left + plotW / 2}
          y={height - 6}
          textAnchor="middle"
          className="fill-slate-500 text-[11px] font-medium"
        >
          Plates sold →
        </text>
        <text
          transform={`translate(12 ${pad.top + plotH / 2}) rotate(-90)`}
          textAnchor="middle"
          className="fill-slate-500 text-[11px] font-medium"
        >
          Profit per plate →
        </text>

        <line
          x1={splitX}
          x2={splitX}
          y1={pad.top}
          y2={pad.top + plotH}
          strokeDasharray="4 4"
          className="stroke-slate-400"
        />
        {splitY != null && (
          <line
            x1={pad.left}
            x2={pad.left + plotW}
            y1={splitY}
            y2={splitY}
            strokeDasharray="4 4"
            className="stroke-slate-400"
          />
        )}
        {quadrantLabel("Puzzles", pad.left + 8, pad.top + 14, "start")}
        {quadrantLabel("Stars", pad.left + plotW - 8, pad.top + 14, "end")}
        {quadrantLabel("Dogs", pad.left + 8, pad.top + plotH - 8, "start")}
        {quadrantLabel("Workhorses", pad.left + plotW - 8, pad.top + plotH - 8, "end")}

        {points.map((d) => {
          const cx = x(d.quantity);
          const cy = y(d.margin!);
          const active = hover?.foodItemId === d.foodItemId;
          return (
            <g key={d.foodItemId}>
              <circle cx={cx} cy={cy} r={active ? 8 : 6} className="fill-orange-600 stroke-white" strokeWidth={2} />
              {labelled.has(d.foodItemId) && (
                <text
                  x={cx + 10}
                  y={cy}
                  dy="0.32em"
                  className="pointer-events-none fill-slate-700 text-[11px] font-medium"
                  style={{
                    paintOrder: "stroke",
                    stroke: "var(--color-white)",
                    strokeWidth: 3,
                  }}
                >
                  {d.name.length > 16 ? `${d.name.slice(0, 15)}…` : d.name}
                </text>
              )}
              <circle
                cx={cx}
                cy={cy}
                r={14}
                fill="transparent"
                tabIndex={0}
                role="button"
                aria-label={`${d.name}: ${d.quantity} sold, ${rupee(d.margin!)} profit per plate, ${CLASS_INFO[d.class].label}`}
                onPointerEnter={() => setHover(d)}
                onPointerLeave={() => setHover((h) => (h?.foodItemId === d.foodItemId ? null : h))}
                onFocus={() => setHover(d)}
                onBlur={() => setHover(null)}
                onClick={() => setHover(d)}
                className="cursor-pointer outline-none"
              />
            </g>
          );
        })}
      </svg>
      {hover && (
        <div
          className="pointer-events-none absolute z-10 w-52 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-raised"
          style={{
            left: Math.min(Math.max(x(hover.quantity) - 104, 0), width - 208),
            top: Math.max(y(hover.margin!) - 96, 0),
          }}
        >
          <p className="font-semibold text-slate-900">{hover.name}</p>
          <p className="mt-0.5 text-slate-600">
            {hover.quantity} sold · {hover.mixPercent}% of plates
          </p>
          <p className="text-slate-600">
            {rupee(hover.margin!)} profit per plate ({hover.marginPercent}%)
          </p>
          <p className="mt-1 font-medium text-slate-800">{CLASS_INFO[hover.class].label}</p>
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500">
        Dashed lines: popular from {Math.ceil(popularQty)} plates (70% of an equal share)
        {avgMargin != null && <> · average profit per plate {rupee(avgMargin)}</>}.
      </p>
    </div>
  );
}

export default function MenuEngineering({ days }: { days: number }) {
  const query = useMenuEngineering(days);
  const report = query.data;

  if (query.error) return <ErrorText>{extractErrorMessage(query.error)}</ErrorText>;
  if (!report) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
    );
  }

  const byClass = (cls: DishClass) => report.dishes.filter((d) => d.class === cls);

  return (
    <div className="flex flex-col gap-4">
      {report.totals.dishesWithoutRecipe > 0 && (
        <Alert
          tone="info"
          title={`${report.totals.dishesWithoutRecipe} dish${report.totals.dishesWithoutRecipe === 1 ? "" : "es"} can't be classified yet`}
        >
          They have no recipe, so their cost per plate is unknown. Add recipes under Inventory → Recipes.
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ORDER.map((cls) => {
          const info = CLASS_INFO[cls];
          const Icon = info.icon;
          const dishes = byClass(cls);
          return (
            <Card key={cls} padding="sm" className="flex flex-col gap-2 sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <Badge tone={info.tone}>
                  <Icon size={12} aria-hidden="true" />
                  {info.label}
                </Badge>
                <span className="text-2xl font-bold text-slate-900 tabular-nums">{dishes.length}</span>
              </div>
              <p className="text-xs leading-relaxed text-slate-600">{info.advice}</p>
              {dishes.length > 0 && (
                <p
                  className="mt-auto truncate text-xs font-medium text-slate-800"
                  title={dishes.map((d) => d.name).join(", ")}
                >
                  {dishes
                    .slice(0, 3)
                    .map((d) => d.name)
                    .join(", ")}
                  {dishes.length > 3 ? ` +${dishes.length - 3}` : ""}
                </p>
              )}
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader
          icon={Lightbulb}
          title="Popularity vs profit"
          description={`Each dot is a dish, from paid bills in the last ${report.days} days. Profit per plate is the average selling price minus recipe cost.`}
        />
        <QuadrantChart report={report} />
      </Card>

      <Card>
        <CardHeader
          title="Every dish"
          description="Sorted by plates sold. Bill-level discounts aren't split across dishes."
          className="mb-3"
          actions={
            <ExcelButton
              fileName={`menu-engineering-${report.days}-days`}
              disabled={report.dishes.length === 0}
              sheets={() => [
                sheet({
                  name: "Menu engineering",
                  rows: report.dishes,
                  columns: [
                    { header: "Dish", value: (d) => d.name, width: 28 },
                    { header: "Category", value: (d) => d.category, width: 18 },
                    {
                      header: "Class",
                      value: (d) => CLASS_INFO[d.class].label,
                    },
                    { header: "Plates", value: (d) => d.quantity },
                    {
                      header: "Menu mix",
                      value: (d) => d.mixPercent / 100,
                      format: PERCENT,
                    },
                    {
                      header: "Revenue",
                      value: (d) => d.revenue,
                      format: MONEY,
                      width: 12,
                    },
                    {
                      header: "Avg price",
                      value: (d) => d.avgPrice,
                      format: MONEY,
                    },
                    {
                      header: "Cost / plate",
                      value: (d) => d.cost,
                      format: MONEY,
                      width: 12,
                    },
                    {
                      header: "Profit / plate",
                      value: (d) => d.margin,
                      format: MONEY,
                      width: 13,
                    },
                    {
                      header: "Margin",
                      value: (d) => (d.marginPercent == null ? null : d.marginPercent / 100),
                      format: PERCENT,
                    },
                    {
                      header: "Total profit",
                      value: (d) => d.totalMargin,
                      format: MONEY,
                      width: 12,
                    },
                  ],
                }),
              ]}
            />
          }
        />
        {report.dishes.length === 0 ? (
          <EmptyState icon={CircleHelp} title="No dishes" description="Add dishes to your menu to see them here." />
        ) : (
          <>
            <ul className="-mx-4 divide-y divide-slate-100 border-t border-slate-100 md:hidden">
              {report.dishes.map((d) => {
                const info = CLASS_INFO[d.class];
                return (
                  <li key={d.foodItemId} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">{d.name}</p>
                      <p className="text-xs text-slate-500">
                        {d.quantity} sold · {d.margin == null ? "no recipe" : `${rupee(d.margin)} per plate`}
                      </p>
                    </div>
                    <Badge tone={info.tone}>{info.label}</Badge>
                  </li>
                );
              })}
            </ul>
            <div className="hidden md:block">
              <TableWrap>
                <table className="min-w-[56rem]">
                  <thead>
                    <tr>
                      <th>Dish</th>
                      <th className="text-right">Sold</th>
                      <th className="text-right">Share</th>
                      <th className="text-right">Avg price</th>
                      <th className="text-right">Cost</th>
                      <th className="text-right">Profit / plate</th>
                      <th className="text-right">Total profit</th>
                      <th>Group</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.dishes.map((d) => {
                      const info = CLASS_INFO[d.class];
                      return (
                        <tr key={d.foodItemId}>
                          <td>
                            <p className="font-medium text-slate-900">{d.name}</p>
                            <p className="text-xs text-slate-500">
                              {d.category}
                              {!d.isActive && " · hidden"}
                            </p>
                          </td>
                          <td className="text-right tabular-nums">{d.quantity}</td>
                          <td className="text-right text-slate-600 tabular-nums">{d.mixPercent}%</td>
                          <td className="text-right tabular-nums">{rupee(d.avgPrice)}</td>
                          <td className="text-right text-slate-600 tabular-nums">
                            {d.cost == null ? "—" : rupee(d.cost)}
                          </td>
                          <td className="text-right font-medium tabular-nums">
                            {d.margin == null ? "—" : rupee(d.margin)}
                            {d.marginPercent != null && (
                              <span className="block text-xs font-normal text-slate-500">{d.marginPercent}%</span>
                            )}
                          </td>
                          <td className="text-right tabular-nums">
                            {d.totalMargin == null ? "—" : rupee0(d.totalMargin)}
                          </td>
                          <td>
                            <Badge tone={info.tone}>{info.label}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableWrap>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
