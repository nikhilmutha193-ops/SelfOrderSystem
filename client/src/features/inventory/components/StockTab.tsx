import { useState } from "react";

import type { StockItem, StockItemInput, StockUnit } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { confirmDialog } from "../../../shared/ui/confirm";
import { Badge, Button, Card, ErrorText, Input, Select, Switch, TableWrap } from "../../../shared/ui/ui";
import { inPurchaseUnits, MOVEMENT_LABEL, qty, rupees } from "../format";
import {
  useCreateCount,
  useCreateStockItem,
  useDeleteStockItem,
  useInventorySettings,
  useLedger,
  useMoveStock,
  useSaveInventorySettings,
  useStockItems,
  useUpdateStockItem,
} from "../queries";

const NO_ITEMS: StockItem[] = [];
const BLANK: StockItemInput = {
  name: "",
  unit: "g",
  purchaseUnit: "kg",
  purchaseFactor: 1000,
  reorderLevel: 0,
  isActive: true,
};
const UNIT_PRESETS: Record<StockUnit, Pick<StockItemInput, "purchaseUnit" | "purchaseFactor">> = {
  g: { purchaseUnit: "kg", purchaseFactor: 1000 },
  ml: { purchaseUnit: "L", purchaseFactor: 1000 },
  pcs: { purchaseUnit: "", purchaseFactor: 1 },
};

function ItemForm({
  initial,
  saving,
  onSave,
  onCancel,
}: {
  initial: StockItemInput;
  saving: boolean;
  onSave: (input: StockItemInput) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState(initial);
  // Most items fit the g→kg / ml→L presets fine, so the purchase-unit conversion stays tucked
  // away unless someone actually needs to change it - one less thing to fill in for every dish.
  const [advanced, setAdvanced] = useState(
    () =>
      initial.purchaseUnit !== UNIT_PRESETS[initial.unit].purchaseUnit ||
      initial.purchaseFactor !== UNIT_PRESETS[initial.unit].purchaseFactor
  );
  const set = (patch: Partial<StockItemInput>) => setForm((f) => ({ ...f, ...patch }));
  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(form);
      }}
    >
      <label className="text-sm font-medium text-slate-700">
        Name
        <Input id="stock-name" className="mt-1" value={form.name} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Counted in
        <Select
          id="stock-unit"
          className="mt-1"
          value={form.unit}
          onChange={(e) => {
            const unit = e.target.value as StockUnit;
            set({ unit, ...UNIT_PRESETS[unit] });
          }}
        >
          <option value="g">grams</option>
          <option value="ml">millilitres</option>
          <option value="pcs">pieces</option>
        </Select>
      </label>
      <label className="text-sm font-medium text-slate-700">
        Alert below ({form.unit})
        <Input
          id="stock-reorder"
          className="mt-1"
          type="number"
          min={0}
          value={form.reorderLevel}
          onChange={(e) => set({ reorderLevel: Number(e.target.value) || 0 })}
        />
      </label>
      {advanced ? (
        <>
          <label className="text-sm font-medium text-slate-700">
            Bought in
            <Input
              id="stock-purchase-unit"
              className="mt-1"
              placeholder="kg, L, tray"
              value={form.purchaseUnit}
              onChange={(e) => set({ purchaseUnit: e.target.value })}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            {form.unit} per {form.purchaseUnit || "unit"}
            <Input
              id="stock-factor"
              className="mt-1"
              type="number"
              min={1}
              value={form.purchaseFactor}
              onChange={(e) => set({ purchaseFactor: Number(e.target.value) || 1 })}
            />
          </label>
        </>
      ) : (
        <p className="self-end pb-2 text-xs text-slate-500 sm:col-span-1">
          Bought in {form.purchaseUnit || "unit"} ({form.purchaseFactor} {form.unit} each) ·{" "}
          <button
            type="button"
            className="font-medium text-orange-600 hover:underline"
            onClick={() => setAdvanced(true)}
          >
            Change
          </button>
        </p>
      )}
      <div className="flex items-center gap-2 sm:col-span-3">
        <Button type="submit" disabled={saving || !form.name.trim()}>
          Save item
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <label className="ml-2 flex items-center gap-2 text-sm text-slate-700">
          <Switch id="stock-active" checked={form.isActive} onChange={(v) => set({ isActive: v })} />
          Active
        </label>
      </div>
    </form>
  );
}

/**
 * One form for every routine stock correction - no more choosing between "opening", "wastage"
 * and "adjustment" up front. Staff just say what's actually on the shelf; for a brand-new item
 * with nothing on hand yet, an optional cost field appears so the first stock-in also sets the
 * average cost (that's what "opening" used to be for). Everything else posts through the same
 * count endpoint the bulk stock-take uses, so the ledger still records it as a real adjustment.
 */
function UpdateStockForm({ item, onDone }: { item: StockItem; onDone: () => void }) {
  const move = useMoveStock();
  const count = useCreateCount();
  const isFirstStock = item.onHand === 0;
  const [amount, setAmount] = useState(String(item.onHand));
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const unitWord = item.purchaseUnit || item.unit;
  const pending = move.isPending || count.isPending;

  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-md bg-slate-50 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          if (isFirstStock && cost !== "") {
            await move.mutateAsync({
              stockItemId: item._id,
              type: "opening",
              quantity: Number(amount),
              unitCost: Number(cost) / item.purchaseFactor,
            });
          } else {
            await count.mutateAsync({
              note: note.trim() || undefined,
              lines: [{ stockItemId: item._id, counted: Number(amount) }],
            });
          }
          onDone();
        } catch (err) {
          setError(extractErrorMessage(err));
        }
      }}
    >
      <label className="text-sm font-medium text-slate-700">
        Now on hand ({item.unit})
        <Input
          id="update-amount"
          className="mt-1 !w-40"
          type="number"
          min={0}
          step="any"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>
      {isFirstStock && (
        <label className="text-sm font-medium text-slate-700">
          Cost per {unitWord} (₹, optional)
          <Input
            id="update-cost"
            className="mt-1 !w-40"
            type="number"
            min={0}
            step="any"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
        </label>
      )}
      <label className="min-w-[12rem] flex-1 text-sm font-medium text-slate-700">
        Note (optional)
        <Input
          id="update-note"
          className="mt-1"
          placeholder="e.g. some spoiled, found extra, restocked"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <Button type="submit" disabled={pending || amount === ""}>
        Update stock
      </Button>
      <Button type="button" variant="secondary" onClick={onDone}>
        Cancel
      </Button>
      <div className="w-full">
        <ErrorText>{error}</ErrorText>
      </div>
    </form>
  );
}

function Ledger({ item }: { item: StockItem }) {
  const ledger = useLedger(item._id);
  return (
    <div className="max-h-72 overflow-y-auto rounded-md bg-slate-50 p-3">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th>When</th>
            <th>What</th>
            <th className="text-right">Change</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {(ledger.data?.movements ?? []).map((m) => (
            <tr key={m._id} className="border-t border-slate-200">
              <td className="whitespace-nowrap">
                {new Date(m.createdAt).toLocaleString([], {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </td>
              <td>{MOVEMENT_LABEL[m.type]}</td>
              <td className={`py-1 text-right tabular-nums ${m.quantity < 0 ? "text-red-700" : "text-green-700"}`}>
                {m.quantity > 0 ? "+" : ""}
                {qty(m.quantity, item.unit)}
              </td>
              <td className="text-slate-600">
                {m.note}
                {m.byName && <span className="text-slate-400"> · {m.byName}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {ledger.data?.movements.length === 0 && <p className="text-xs text-slate-500">No movements yet.</p>}
    </div>
  );
}

export function StockTab({ canEdit }: { canEdit: boolean }) {
  const items = useStockItems();
  const settings = useInventorySettings();
  const saveSettings = useSaveInventorySettings();
  const create = useCreateStockItem();
  const update = useUpdateStockItem();
  const remove = useDeleteStockItem();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState<{
    id: string;
    panel: "update" | "history";
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const allItems = items.data ?? NO_ITEMS;
  const inactiveCount = allItems.filter((i) => !i.isActive).length;
  const list = showInactive ? allItems : allItems.filter((i) => i.isActive);
  const lowCount = list.filter((i) => i.low).length;

  async function run(action: () => Promise<unknown>, after: () => void) {
    setError(null);
    try {
      await action();
      after();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-600">
              {list.length} items · stock value{" "}
              <span className="font-semibold">{rupees(list.reduce((s, i) => s + i.value, 0))}</span>
              {lowCount > 0 && <span className="ml-2 font-semibold text-red-600">{lowCount} running low</span>}
            </p>
            <div className="mt-3 flex items-center gap-3">
              <Switch
                id="auto-sold-out"
                disabled={!canEdit || saveSettings.isPending}
                checked={settings.data?.autoSoldOut ?? false}
                onChange={(v) =>
                  run(
                    () => saveSettings.mutateAsync(v),
                    () => {}
                  )
                }
              />
              <label htmlFor="auto-sold-out" className="text-sm text-slate-700">
                Mark dishes sold out when a key ingredient runs out
              </label>
            </div>
            {inactiveCount > 0 && (
              <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
                Show {inactiveCount} inactive item
                {inactiveCount === 1 ? "" : "s"}
              </label>
            )}
          </div>
          {canEdit && !adding && <Button onClick={() => setAdding(true)}>Add stock item</Button>}
        </div>
        {adding && (
          <div className="mt-4">
            <ItemForm
              initial={BLANK}
              saving={create.isPending}
              onCancel={() => setAdding(false)}
              onSave={(input) =>
                run(
                  () => create.mutateAsync(input),
                  () => setAdding(false)
                )
              }
            />
          </div>
        )}
      </Card>
      <ErrorText>{error ?? (items.error ? extractErrorMessage(items.error) : null)}</ErrorText>
      <Card>
        <TableWrap>
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr>
                <th>Item</th>
                <th className="text-right">In stock</th>
                <th className="text-right">Alert below</th>
                <th className="text-right">Avg cost</th>
                <th className="text-right">Value</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {list.map((item) => (
                <StockRow
                  key={item._id}
                  item={item}
                  canEdit={canEdit}
                  editing={editing === item._id}
                  open={open?.id === item._id ? open.panel : null}
                  onOpen={(panel) =>
                    setOpen(panel && !(open?.id === item._id && open.panel === panel) ? { id: item._id, panel } : null)
                  }
                  onEdit={(on) => setEditing(on ? item._id : null)}
                  onSave={(input) =>
                    run(
                      () => update.mutateAsync({ id: item._id, input }),
                      () => setEditing(null)
                    )
                  }
                  saving={update.isPending}
                  onDelete={async () => {
                    const ok = await confirmDialog({
                      title: `Delete ${item.name}?`,
                      message: "This can't be undone.",
                      confirmLabel: "Delete",
                    });
                    if (!ok) return;
                    run(
                      () => remove.mutateAsync(item._id),
                      () => {}
                    );
                  }}
                />
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    Add the ingredients you buy, then give each dish a recipe.
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

function StockRow({
  item,
  canEdit,
  editing,
  open,
  onOpen,
  onEdit,
  onSave,
  saving,
  onDelete,
}: {
  item: StockItem;
  canEdit: boolean;
  editing: boolean;
  open: "update" | "history" | null;
  onOpen: (panel: "update" | "history" | null) => void;
  onEdit: (on: boolean) => void;
  onSave: (input: StockItemInput) => void;
  saving: boolean;
  onDelete: () => void;
}) {
  const bought = inPurchaseUnits(item.onHand, item);
  return (
    <>
      <tr className="border-t border-slate-100" data-stock={item.name}>
        <td>
          <span className="font-medium text-slate-800">{item.name}</span> {item.low && <Badge tone="red">Low</Badge>}{" "}
          {!item.isActive && <Badge tone="gray">Not in use</Badge>}
        </td>
        <td className="text-right tabular-nums">
          {qty(item.onHand, item.unit)}
          {bought && <span className="block text-xs text-slate-400">{bought}</span>}
        </td>
        <td className="text-right tabular-nums text-slate-600">
          {item.reorderLevel ? qty(item.reorderLevel, item.unit) : "-"}
        </td>
        <td className="text-right tabular-nums">
          {rupees(item.avgCost * item.purchaseFactor)}
          <span className="text-xs text-slate-400">/{item.purchaseUnit || item.unit}</span>
        </td>
        <td className="text-right tabular-nums">{rupees(item.value)}</td>
        <td>
          <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-xs font-medium">
            {canEdit && (
              <>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-sm font-medium transition-colors text-orange-700 hover:bg-orange-50"
                  onClick={() => onOpen("update")}
                >
                  Update stock
                </button>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100"
                  onClick={() => onEdit(!editing)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-sm font-medium transition-colors text-red-600 hover:bg-red-50"
                  onClick={onDelete}
                >
                  Delete
                </button>
              </>
            )}
            <button
              type="button"
              className="rounded-md px-2 py-1 text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100"
              onClick={() => onOpen("history")}
            >
              History
            </button>
          </div>
        </td>
      </tr>
      {(editing || open) && (
        <tr>
          <td colSpan={6} className="pb-3">
            {editing ? (
              <ItemForm initial={item} saving={saving} onSave={onSave} onCancel={() => onEdit(false)} />
            ) : open === "history" ? (
              <Ledger item={item} />
            ) : (
              open && <UpdateStockForm item={item} onDone={() => onOpen(null)} />
            )}
          </td>
        </tr>
      )}
    </>
  );
}
