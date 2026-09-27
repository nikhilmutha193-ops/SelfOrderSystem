import { useState } from "react";

import type { StockItem, StockItemInput, StockUnit } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { Badge, Button, Card, ErrorText, Input, Select, Switch, TableWrap } from "../../../shared/ui/ui";
import { inPurchaseUnits, MOVEMENT_LABEL, qty, rupees } from "../format";
import {
  useCreateStockItem,
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

type MoveKind = "opening" | "wastage" | "adjustment";

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
  const set = (patch: Partial<StockItemInput>) => setForm((f) => ({ ...f, ...patch }));
  return (
    <form
      className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(form);
      }}
    >
      <label className="text-sm font-medium text-slate-700 sm:col-span-2">
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
      <div className="flex items-end gap-2 sm:col-span-3 lg:col-span-6">
        <Button type="submit" disabled={saving || !form.name.trim()}>
          Save item
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

function MoveForm({ item, kind, onDone }: { item: StockItem; kind: MoveKind; onDone: () => void }) {
  const move = useMoveStock();
  const [amount, setAmount] = useState("");
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const unitWord = item.purchaseUnit || item.unit;

  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-md bg-slate-50 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await move.mutateAsync({
            stockItemId: item._id,
            type: kind,
            quantity: Number(amount),
            unitCost: kind === "opening" && cost !== "" ? Number(cost) / item.purchaseFactor : undefined,
            note: note.trim() || undefined,
          });
          onDone();
        } catch (err) {
          setError(extractErrorMessage(err));
        }
      }}
    >
      <label className="text-sm font-medium text-slate-700">
        {kind === "adjustment" ? `Change (${item.unit}, use − to reduce)` : `Quantity (${item.unit})`}
        <Input
          id="move-quantity"
          className="mt-1 !w-40"
          type="number"
          step="any"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>
      {kind === "opening" && (
        <label className="text-sm font-medium text-slate-700">
          Cost per {unitWord} (₹, optional)
          <Input
            id="move-cost"
            className="mt-1 !w-40"
            type="number"
            min={0}
            step="any"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
        </label>
      )}
      {kind !== "opening" && (
        <label className="min-w-[12rem] flex-1 text-sm font-medium text-slate-700">
          Reason
          <Input
            id="move-note"
            className="mt-1"
            placeholder={kind === "wastage" ? "e.g. milk turned sour" : "e.g. found extra in store"}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      )}
      <Button type="submit" disabled={move.isPending || amount === ""}>
        Save {MOVEMENT_LABEL[kind].toLowerCase()}
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
                {new Date(m.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
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
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState<{ id: string; panel: MoveKind | "history" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = items.data ?? NO_ITEMS;
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
}: {
  item: StockItem;
  canEdit: boolean;
  editing: boolean;
  open: MoveKind | "history" | null;
  onOpen: (panel: MoveKind | "history" | null) => void;
  onEdit: (on: boolean) => void;
  onSave: (input: StockItemInput) => void;
  saving: boolean;
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
                  onClick={() => onOpen("opening")}
                >
                  Opening
                </button>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-sm font-medium transition-colors text-orange-700 hover:bg-orange-50"
                  onClick={() => onOpen("wastage")}
                >
                  Wastage
                </button>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-sm font-medium transition-colors text-orange-700 hover:bg-orange-50"
                  onClick={() => onOpen("adjustment")}
                >
                  Adjust
                </button>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100"
                  onClick={() => onEdit(!editing)}
                >
                  Edit
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
              open && <MoveForm item={item} kind={open} onDone={() => onOpen(null)} />
            )}
          </td>
        </tr>
      )}
    </>
  );
}
