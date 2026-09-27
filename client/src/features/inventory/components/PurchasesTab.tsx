import { useState } from "react";

import type { StockItem, Vendor } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { Button, Card, ErrorText, Input, Select, TableWrap } from "../../../shared/ui/ui";
import { daysAgo, isoDate, rupees } from "../format";
import { useCreatePurchase, useCreateVendor, usePurchases, useStockItems, useVendors } from "../queries";

const NO_ITEMS: StockItem[] = [];
const NO_VENDORS: Vendor[] = [];

interface Line {
  stockItemId: string;
  quantity: string;
  unitPrice: string;
}

function VendorForm({ onDone }: { onDone: (vendor: Vendor) => void }) {
  const create = useCreateVendor();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [gstin, setGstin] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md bg-slate-50 p-3">
      <Input
        id="vendor-name"
        className="!w-48"
        placeholder="Vendor name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Input className="!w-36" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <Input
        className="!w-48"
        placeholder="GSTIN (optional)"
        value={gstin}
        onChange={(e) => setGstin(e.target.value)}
      />
      <Button
        type="button"
        disabled={create.isPending || !name.trim()}
        onClick={async () => {
          setError(null);
          try {
            onDone(await create.mutateAsync({ name: name.trim(), phone, gstin }));
          } catch (err) {
            setError(extractErrorMessage(err));
          }
        }}
      >
        Save vendor
      </Button>
      <div className="w-full">
        <ErrorText>{error}</ErrorText>
      </div>
    </div>
  );
}

export function PurchasesTab({ canEdit }: { canEdit: boolean }) {
  const items = (useStockItems().data ?? NO_ITEMS).filter((i) => i.isActive);
  const vendors = useVendors().data ?? NO_VENDORS;
  const create = useCreatePurchase();
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(isoDate(new Date()));
  const register = usePurchases({ from, to });

  const [vendorId, setVendorId] = useState("");
  const [addingVendor, setAddingVendor] = useState(false);
  const [invoiceRef, setInvoiceRef] = useState("");
  const [purchasedOn, setPurchasedOn] = useState(isoDate(new Date()));
  const [lines, setLines] = useState<Line[]>([{ stockItemId: "", quantity: "", unitPrice: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const itemOf = (id: string) => items.find((i) => i._id === id);
  const amount = (l: Line) => (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);
  const total = lines.reduce((s, l) => s + amount(l), 0);
  const update = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(null);
    try {
      const created = await create.mutateAsync({
        vendorId: vendorId || undefined,
        invoiceRef: invoiceRef.trim() || undefined,
        purchasedOn,
        lines: lines
          .filter((l) => l.stockItemId)
          .map((l) => ({ stockItemId: l.stockItemId, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })),
      });
      setSaved(`Purchase saved: ${rupees(created.total)}`);
      setLines([{ stockItemId: "", quantity: "", unitPrice: "" }]);
      setInvoiceRef("");
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {canEdit && (
        <Card>
          <h2 className="mb-4 text-base font-semibold text-slate-900">Record a purchase</h2>
          <form className="flex flex-col gap-3" onSubmit={submit}>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm font-medium text-slate-700">
                Vendor
                <Select
                  id="purchase-vendor"
                  className="mt-1 !w-52"
                  value={vendorId}
                  onChange={(e) => setVendorId(e.target.value)}
                >
                  <option value="">No vendor</option>
                  {vendors.map((v) => (
                    <option key={v._id} value={v._id}>
                      {v.name}
                    </option>
                  ))}
                </Select>
              </label>
              <Button type="button" variant="secondary" onClick={() => setAddingVendor((v) => !v)}>
                {addingVendor ? "Close" : "New vendor"}
              </Button>
              <label className="text-sm font-medium text-slate-700">
                Invoice no.
                <Input
                  id="purchase-ref"
                  className="mt-1 !w-40"
                  value={invoiceRef}
                  onChange={(e) => setInvoiceRef(e.target.value)}
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Date
                <Input
                  id="purchase-date"
                  className="mt-1 !w-44"
                  type="date"
                  value={purchasedOn}
                  onChange={(e) => setPurchasedOn(e.target.value)}
                />
              </label>
            </div>
            {addingVendor && (
              <VendorForm
                onDone={(vendor) => {
                  setVendorId(vendor._id);
                  setAddingVendor(false);
                }}
              />
            )}
            {lines.map((line, i) => {
              const item = itemOf(line.stockItemId);
              const per = item?.purchaseUnit || item?.unit || "unit";
              return (
                <div key={i} className="flex flex-wrap items-center gap-2" data-testid="purchase-line">
                  <Select
                    aria-label="Stock item"
                    className="!w-52"
                    value={line.stockItemId}
                    onChange={(e) => update(i, { stockItemId: e.target.value })}
                  >
                    <option value="">Choose item</option>
                    {items.map((it) => (
                      <option key={it._id} value={it._id}>
                        {it.name}
                      </option>
                    ))}
                  </Select>
                  <Input
                    aria-label="Quantity"
                    className="!w-24"
                    type="number"
                    min={0}
                    step="any"
                    placeholder="Qty"
                    value={line.quantity}
                    onChange={(e) => update(i, { quantity: e.target.value })}
                  />
                  <span className="w-10 text-sm text-slate-500">{per}</span>
                  <Input
                    aria-label="Price"
                    className="!w-28"
                    type="number"
                    min={0}
                    step="any"
                    placeholder={`₹ per ${per}`}
                    value={line.unitPrice}
                    onChange={(e) => update(i, { unitPrice: e.target.value })}
                  />
                  <span className="w-24 text-right text-sm tabular-nums">{rupees(amount(line))}</span>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      className="text-xs text-red-600"
                      onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                    >
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setLines((ls) => [...ls, { stockItemId: "", quantity: "", unitPrice: "" }])}
              >
                Add line
              </Button>
              <span className="text-base font-bold tabular-nums">Total {rupees(total)}</span>
            </div>
            <ErrorText>{error}</ErrorText>
            {saved && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
                {saved}
              </p>
            )}
            <div>
              <Button type="submit" disabled={create.isPending || !lines.some((l) => l.stockItemId)}>
                Save purchase
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">Purchase register</h2>
          <div className="flex items-end gap-2">
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
        <ErrorText>{register.error ? extractErrorMessage(register.error) : null}</ErrorText>
        <TableWrap>
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr>
                <th>Date</th>
                <th>Vendor</th>
                <th>Invoice</th>
                <th>Items</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {(register.data?.purchases ?? []).map((p) => (
                <tr key={p._id} className="border-t border-slate-100 align-top">
                  <td className="whitespace-nowrap">{new Date(p.purchasedAt).toLocaleDateString()}</td>
                  <td>{p.vendorName || "-"}</td>
                  <td>{p.invoiceRef || "-"}</td>
                  <td className="text-xs text-slate-600">
                    {p.lines.map((l) => `${l.name} ${l.quantity} ${l.purchaseUnit}`).join(", ")}
                  </td>
                  <td className="text-right tabular-nums">{rupees(p.total)}</td>
                </tr>
              ))}
              {(register.data?.purchases ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-sm text-slate-500">
                    No purchases in these dates
                  </td>
                </tr>
              )}
            </tbody>
            {register.data && register.data.purchases.length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-200 font-semibold">
                  <td colSpan={4} className="py-2">
                    Total
                  </td>
                  <td className="text-right tabular-nums">{rupees(register.data.total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </TableWrap>
      </Card>
    </div>
  );
}
