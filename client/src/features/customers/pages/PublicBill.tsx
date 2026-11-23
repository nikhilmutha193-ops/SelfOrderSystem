import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";

import { extractErrorMessage } from "../../../shared/api/client";
import { customersApi } from "../api";

const rupees = (n: number) => `₹${n.toFixed(2)}`;

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={`flex justify-between tabular-nums ${strong ? "text-lg font-bold text-slate-900" : "text-sm text-slate-600"}`}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export default function PublicBill() {
  const { token = "" } = useParams<{ token: string }>();
  const bill = useQuery({
    queryKey: ["public-bill", token],
    queryFn: () => customersApi.publicBill(token),
    retry: false,
  });
  const apiBase = import.meta.env.VITE_API_BASE_URL || "/api";

  if (bill.error) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-6">
        <p className="max-w-sm rounded-lg bg-white p-6 text-center text-slate-700 shadow">
          {extractErrorMessage(bill.error)}
        </p>
      </div>
    );
  }
  if (!bill.data) return <p className="p-6 text-sm text-slate-500">Loading your bill…</p>;
  const { restaurant, order, items, totals, display } = bill.data;
  const headerOrder = display.headerOrder ?? ["name", "subtext", "address", "gstin", "fssai", "title", "token"];
  const detailsOrder = display.detailsOrder ?? ["invoiceNumber", "dateTime", "orderType", "customer", "customerGstin"];
  // The invoice number and the date share one row; the rest are lines under it, all in the order set in Invoice settings.
  const rowFields = detailsOrder.filter((f) => f === "invoiceNumber" || f === "dateTime");
  const lineFields = detailsOrder.filter((f) => f !== "invoiceNumber" && f !== "dateTime");
  const headerPart = (field: string) => {
    if (field === "name")
      return <h1 key={field} className="text-xl font-bold text-slate-900">{restaurant.name}</h1>;
    if (field === "subtext") return restaurant.subText ? <p key={field} className="text-sm text-slate-600">{restaurant.subText}</p> : null;
    if (field === "address") return restaurant.address ? <p key={field} className="text-xs text-slate-500">{restaurant.address}</p> : null;
    if (field === "gstin") return restaurant.gstin ? <p key={field} className="text-xs text-slate-500">GSTIN {restaurant.gstin}</p> : null;
    if (field === "fssai")
      return restaurant.fssaiLicense ? <p key={field} className="text-xs text-slate-500">FSSAI {restaurant.fssaiLicense}</p> : null;
    if (field === "title") return <p key={field} className="mt-2 text-sm font-semibold text-slate-800">{order.title}</p>;
    if (field === "token" && order.token)
      return (
        <p key={field} className="mx-auto mt-2 max-w-xs rounded-lg bg-orange-50 py-2 text-2xl font-extrabold text-orange-700">
          {order.token}
        </p>
      );
    return null;
  };
  const linePart = (field: string) => {
    if (field === "orderType") return <p key={field}>Order: {order.orderTypeText}</p>;
    if (field === "customer")
      return (
        <p key={field}>
          Customer: {order.customerName}
          {order.customerPhone ? `  (${order.customerPhone})` : ""}
        </p>
      );
    if (field === "customerGstin" && order.customerGstin) return <p key={field}>Customer GSTIN: {order.customerGstin}</p>;
    return null;
  };

  return (
    <div className="min-h-dvh bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-md rounded-xl bg-white p-5 shadow">
        <div className="mb-4 text-center">
          {restaurant.logoUrl && (
            <img src={restaurant.logoUrl} alt="" className="mx-auto mb-2 h-14 w-14 rounded-full object-cover" />
          )}
          {headerOrder.map(headerPart)}
        </div>
        <div className="mb-3 flex justify-between border-y border-dashed border-slate-200 py-2 text-sm">
          {rowFields.map((field) =>
            field === "invoiceNumber" ? (
              <span key={field}>
                Invoice No <span className="font-semibold">{order.invoiceNumber}</span>
              </span>
            ) : (
              <span key={field}>
                {new Date(order.billedAt).toLocaleString("en-IN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: restaurant.timezone,
                })}
              </span>
            )
          )}
        </div>
        {order.status === "cancelled" && (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-center text-sm font-semibold text-red-700">
            This bill was {order.voided ? "voided" : "cancelled"}
          </p>
        )}
        <div className="mb-3 flex flex-col gap-0.5 text-sm text-slate-600">
          {lineFields.map(linePart)}
          {order.placeOfSupply && <p>Place of supply: {order.placeOfSupply}</p>}
          <p>SAC: {order.sac} (restaurant service)</p>
        </div>
        <ul className="mb-3 flex flex-col gap-1.5 text-sm">
          {items.map((item, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span>
                {item.quantity} × {item.foodName}
                {display.showJainTag && item.isJain && " (Jain)"}
                {display.showUnitPrice && <span className="text-slate-400"> @ {rupees(item.unitPrice)}</span>}
                {item.complimentary && <span className="text-green-700"> (Complimentary)</span>}
              </span>
              <span className="tabular-nums">{rupees(item.total)}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-1 border-t border-slate-200 pt-2">
          <Row label="Subtotal" value={rupees(totals.subtotal)} />
          {(totals.couponDiscount ?? 0) > 0 && (
            <Row
              label={`Coupon${order.couponCode ? ` (${order.couponCode})` : ""}`}
              value={`−${rupees(totals.couponDiscount!)}`}
            />
          )}
          {(totals.manualDiscount ?? 0) > 0 && <Row label="Discount" value={`−${rupees(totals.manualDiscount!)}`} />}
          {(totals.loyaltyDiscount ?? 0) > 0 && (
            <Row label="Loyalty points" value={`−${rupees(totals.loyaltyDiscount!)}`} />
          )}
          {(totals.serviceCharge ?? 0) > 0 && (
            <Row label={`Service charge (${totals.serviceChargePercent}%)`} value={rupees(totals.serviceCharge!)} />
          )}
          {(totals.packagingCharge ?? 0) > 0 && <Row label="Packaging" value={rupees(totals.packagingCharge!)} />}
          {(totals.extraCharges ?? []).map((c) => (
            <Row key={c.name} label={c.name} value={rupees(c.amount)} />
          ))}
          {totals.taxLines.map((t) => (
            <Row key={t.name} label={`${t.name} ${t.percent}%`} value={rupees(t.amount)} />
          ))}
          {totals.roundOff !== 0 && <Row label="Round off" value={rupees(totals.roundOff)} />}
          <Row label="Total" value={rupees(totals.grandTotal)} strong />
        </div>
        {order.payments.length > 0 && (
          <div className="mt-2 flex flex-col gap-0.5 border-t border-dashed border-slate-200 pt-2">
            {order.payments.map((p, i) => (
              <div key={i}>
                <Row label={p.label} value={rupees(p.amount)} />
                {p.change > 0 && (
                  <Row label={`Cash received ${rupees(p.tendered ?? 0)}, change`} value={rupees(p.change)} />
                )}
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-center text-sm font-medium text-slate-600">
          {order.status === "closed" ? "Paid, thank you!" : order.status === "billed" ? "Awaiting payment" : ""}
        </p>
        {display.termsText && <p className="mt-4 whitespace-pre-line text-xs text-slate-500">{display.termsText}</p>}
        <p className="mt-3 text-center text-sm text-slate-600">{display.footerNote}</p>
        <a
          href={`${apiBase}/bills/public/${token}/pdf`}
          className="mt-4 block rounded-md bg-orange-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-orange-700"
        >
          Download PDF
        </a>
      </div>
    </div>
  );
}
