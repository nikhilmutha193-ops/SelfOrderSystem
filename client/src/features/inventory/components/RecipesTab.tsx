import { useState } from "react";

import type { RecipeLine, RecipeModifierLine, RecipeRow, StockItem } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { Badge, Button, Card, ErrorText, Input, Select, TableWrap } from "../../../shared/ui/ui";
import { rupees } from "../format";
import { useRecipes, useSaveRecipe, useStockItems } from "../queries";

const NO_ROWS: RecipeRow[] = [];
const NO_ITEMS: StockItem[] = [];

function costTone(percent: number | null) {
  if (percent === null) return "text-slate-400";
  if (percent > 40) return "text-red-600";
  if (percent > 30) return "text-amber-700";
  return "text-green-700";
}

function RecipeEditor({ row, items, onDone }: { row: RecipeRow; items: StockItem[]; onDone: () => void }) {
  const save = useSaveRecipe();
  const [lines, setLines] = useState<RecipeLine[]>(row.recipe?.lines ?? []);
  const [extras, setExtras] = useState<RecipeModifierLine[]>(row.recipe?.modifierLines ?? []);
  const [error, setError] = useState<string | null>(null);
  const unitOf = (id: string) => items.find((i) => i._id === id)?.unit ?? "";
  const options = row.modifierGroups.flatMap((g) => g.options.map((o) => ({ groupName: g.name, label: o.label })));
  const first = items[0]?._id ?? "";

  return (
    <div className="flex flex-col gap-3 rounded-md bg-slate-50 p-3">
      <p className="text-sm font-semibold text-slate-700">Ingredients for one {row.name}</p>
      {lines.map((line, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2" data-testid="recipe-line">
          <Select
            aria-label="Ingredient"
            className="!w-48"
            value={line.stockItemId}
            onChange={(e) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, stockItemId: e.target.value } : l)))}
          >
            {items.map((item) => (
              <option key={item._id} value={item._id}>
                {item.name}
              </option>
            ))}
          </Select>
          <Input
            aria-label="Quantity"
            className="!w-28"
            type="number"
            min={0}
            step="any"
            value={line.quantity || ""}
            onChange={(e) =>
              setLines((ls) => ls.map((l, j) => (j === i ? { ...l, quantity: Number(e.target.value) } : l)))
            }
          />
          <span className="w-8 text-sm text-slate-500">{unitOf(line.stockItemId)}</span>
          <label
            className="flex items-center gap-1 text-xs text-slate-600"
            title="The dish is sold out when this runs out"
          >
            <input
              type="checkbox"
              checked={line.key}
              onChange={(e) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, key: e.target.checked } : l)))}
            />
            Key
          </label>
          <button
            type="button"
            className="text-xs text-red-600"
            onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
          >
            Remove
          </button>
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="secondary"
          disabled={!first}
          onClick={() => setLines((ls) => [...ls, { stockItemId: first, quantity: 0, key: false }])}
        >
          Add ingredient
        </Button>
      </div>

      {options.length > 0 && (
        <>
          <p className="mt-2 text-sm font-semibold text-slate-700">Extra stock used by options</p>
          {extras.map((line, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Select
                aria-label="Option"
                className="!w-40"
                value={`${line.groupName}|${line.label}`}
                onChange={(e) => {
                  const [groupName, label] = e.target.value.split("|");
                  setExtras((xs) => xs.map((x, j) => (j === i ? { ...x, groupName, label } : x)));
                }}
              >
                {options.map((o) => (
                  <option key={`${o.groupName}|${o.label}`} value={`${o.groupName}|${o.label}`}>
                    {o.groupName}: {o.label}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="Extra ingredient"
                className="!w-40"
                value={line.stockItemId}
                onChange={(e) =>
                  setExtras((xs) => xs.map((x, j) => (j === i ? { ...x, stockItemId: e.target.value } : x)))
                }
              >
                {items.map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.name}
                  </option>
                ))}
              </Select>
              <Input
                aria-label="Extra quantity"
                className="!w-24"
                type="number"
                min={0}
                step="any"
                value={line.quantity || ""}
                onChange={(e) =>
                  setExtras((xs) => xs.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)))
                }
              />
              <span className="w-8 text-sm text-slate-500">{unitOf(line.stockItemId)}</span>
              <button
                type="button"
                className="text-xs text-red-600"
                onClick={() => setExtras((xs) => xs.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="secondary"
              disabled={!first}
              onClick={() => setExtras((xs) => [...xs, { ...options[0], stockItemId: first, quantity: 0 }])}
            >
              Add option extra
            </Button>
          </div>
        </>
      )}

      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={save.isPending}
          onClick={async () => {
            setError(null);
            try {
              await save.mutateAsync({
                foodItemId: row.foodItemId,
                lines,
                modifierLines: extras,
              });
              onDone();
            } catch (err) {
              setError(extractErrorMessage(err));
            }
          }}
        >
          Save recipe
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function RecipesTab({ canEdit }: { canEdit: boolean }) {
  const recipes = useRecipes();
  const items = (useStockItems().data ?? NO_ITEMS).filter((i) => i.isActive);
  const [editing, setEditing] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "missing">("all");
  const rows = (recipes.data ?? NO_ROWS).filter((r) => filter === "all" || !r.recipe);
  const missing = (recipes.data ?? NO_ROWS).filter((r) => !r.recipe).length;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          Stock is used when a dish's KOT is sent. Dishes without a recipe don't touch stock.
        </p>
        <Select
          className="!w-56"
          aria-label="Show"
          value={filter}
          onChange={(e) => setFilter(e.target.value as "all" | "missing")}
        >
          <option value="all">All dishes</option>
          <option value="missing">Without a recipe ({missing})</option>
        </Select>
      </div>
      <ErrorText>{recipes.error ? extractErrorMessage(recipes.error) : null}</ErrorText>
      <TableWrap>
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr>
              <th>Dish</th>
              <th>Recipe</th>
              <th className="text-right">Price</th>
              <th className="text-right">Recipe cost</th>
              <th className="text-right">Food cost</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <FoodRow
                key={row.foodItemId}
                row={row}
                items={items}
                canEdit={canEdit}
                editing={editing === row.foodItemId}
                onEdit={(on) => setEditing(on ? row.foodItemId : null)}
              />
            ))}
          </tbody>
        </table>
      </TableWrap>
    </Card>
  );
}

function FoodRow({
  row,
  items,
  canEdit,
  editing,
  onEdit,
}: {
  row: RecipeRow;
  items: StockItem[];
  canEdit: boolean;
  editing: boolean;
  onEdit: (on: boolean) => void;
}) {
  const names = new Map(items.map((i) => [i._id, i]));
  return (
    <>
      <tr className="border-t border-slate-100" data-recipe={row.name}>
        <td className="font-medium text-slate-800">
          {row.name} {row.soldOutByStock && <Badge tone="red">Sold out (stock)</Badge>}
        </td>
        <td className="text-xs text-slate-600">
          {row.recipe
            ? row.recipe.lines
                .map(
                  (l) => `${names.get(l.stockItemId)?.name ?? "?"} ${l.quantity}${names.get(l.stockItemId)?.unit ?? ""}`
                )
                .join(", ")
            : "No recipe"}
        </td>
        <td className="text-right tabular-nums">{rupees(row.price)}</td>
        <td className="text-right tabular-nums">{row.recipe ? rupees(row.cost) : "-"}</td>
        <td className={`py-2 text-right font-semibold tabular-nums ${costTone(row.costPercent)}`}>
          {row.costPercent === null ? "-" : `${row.costPercent.toFixed(1)}%`}
        </td>
        <td className="text-right">
          {canEdit && (
            <button
              type="button"
              className="text-xs font-medium text-orange-600 hover:underline"
              onClick={() => onEdit(!editing)}
            >
              {row.recipe ? "Edit recipe" : "Add recipe"}
            </button>
          )}
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={6} className="pb-3">
            {items.length === 0 ? (
              <p className="text-sm text-amber-700">Add stock items first.</p>
            ) : (
              <RecipeEditor row={row} items={items} onDone={() => onEdit(false)} />
            )}
          </td>
        </tr>
      )}
    </>
  );
}
