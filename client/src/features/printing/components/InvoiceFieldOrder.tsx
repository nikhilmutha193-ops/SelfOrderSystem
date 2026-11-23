import { ArrowDown, ArrowUp } from "lucide-react";

export const HEADER_FIELDS = ["name", "subtext", "address", "gstin", "fssai", "title", "token"] as const;
export const DETAIL_FIELDS = ["invoiceNumber", "dateTime", "orderType", "customer", "customerGstin"] as const;

const LABELS: Record<string, string> = {
  name: "Restaurant name",
  subtext: "Text under the name",
  address: "Address",
  gstin: "GSTIN",
  fssai: "FSSAI number",
  title: "Title (Tax Invoice)",
  token: "Token (cafe orders)",
  invoiceNumber: "Invoice number",
  dateTime: "Date and time",
  orderType: "Order type",
  customer: "Customer name and phone",
  customerGstin: "Customer GSTIN",
};

/** Known fields once each, in the saved order, with any the list misses added at the end (as the server does). */
export function orderedFields(saved: string[] | undefined, all: readonly string[]): string[] {
  const known = [...new Set((saved ?? []).filter((k) => all.includes(k)))];
  return [...known, ...all.filter((k) => !known.includes(k))];
}

function OrderList({
  title,
  fields,
  onChange,
}: {
  title: string;
  fields: string[];
  onChange: (next: string[]) => void;
}) {
  const move = (index: number, to: number) => {
    const next = [...fields];
    [next[index], next[to]] = [next[to], next[index]];
    onChange(next);
  };
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-slate-600">{title}</p>
      <ol className="flex flex-col gap-1">
        {fields.map((field, i) => (
          <li key={field} className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm">
            <span className="w-5 text-xs text-slate-400">{i + 1}</span>
            <span className="flex-1">{LABELS[field] ?? field}</span>
            <button
              type="button"
              aria-label={`Move ${LABELS[field]} up`}
              className="rounded p-1 text-slate-600 disabled:opacity-30"
              disabled={i === 0}
              onClick={() => move(i, i - 1)}
            >
              <ArrowUp size={16} />
            </button>
            <button
              type="button"
              aria-label={`Move ${LABELS[field]} down`}
              className="rounded p-1 text-slate-600 disabled:opacity-30"
              disabled={i === fields.length - 1}
              onClick={() => move(i, i + 1)}
            >
              <ArrowDown size={16} />
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Settings > Invoice: the order of the lines at the top of the invoice and of the details under it. */
export function InvoiceFieldOrder({
  headerOrder,
  detailsOrder,
  onHeader,
  onDetails,
}: {
  headerOrder?: string[];
  detailsOrder?: string[];
  onHeader: (next: string[]) => void;
  onDetails: (next: string[]) => void;
}) {
  return (
    <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
      <OrderList title="Top of the invoice" fields={orderedFields(headerOrder, HEADER_FIELDS)} onChange={onHeader} />
      <OrderList title="Details under it" fields={orderedFields(detailsOrder, DETAIL_FIELDS)} onChange={onDetails} />
      <p className="text-xs text-slate-500 sm:col-span-2">
        Applies to the thermal bill, the PDF invoice and the bill link. A line that is switched off in the invoice layout
        below, or has nothing to show, stays out.
      </p>
    </div>
  );
}
