import { useEffect, useMemo, useState } from "react";

import type { Coupon, CouponType } from "../../lib/types";
import { api, extractErrorMessage } from "../../shared/api/client";
import { confirmDialog } from "../../shared/ui/confirm";
import { usePageTour, type TourStep } from "../../shared/ui/PageTour";
import { Badge, Button, Card, ErrorText, Input, PageHeader, Select, TableWrap } from "../../shared/ui/ui";

export default function Coupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [code, setCode] = useState("");
  const [type, setType] = useState<CouponType>("percent");
  const [value, setValue] = useState<number>(10);
  const [minOrderValue, setMinOrderValue] = useState<number>(0);
  const [maxDiscountAmount, setMaxDiscountAmount] = useState<string>("");
  const [usageLimit, setUsageLimit] = useState<string>("");
  const [perCustomerLimit, setPerCustomerLimit] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .get<Coupon[]>("/coupons")
      .then((res) => setCoupons(res.data))
      .catch((err) => setError(extractErrorMessage(err)));
  }

  useEffect(load, []);

  function resetForm() {
    setEditing(null);
    setCode("");
    setType("percent");
    setValue(10);
    setMinOrderValue(0);
    setMaxDiscountAmount("");
    setUsageLimit("");
    setPerCustomerLimit("");
    setExpiresAt("");
  }

  function edit(coupon: Coupon) {
    setEditing(coupon);
    setCode(coupon.code);
    setType(coupon.type);
    setValue(coupon.value);
    setMinOrderValue(coupon.minOrderValue);
    setMaxDiscountAmount(coupon.maxDiscountAmount !== undefined ? String(coupon.maxDiscountAmount) : "");
    setUsageLimit(coupon.usageLimit !== undefined ? String(coupon.usageLimit) : "");
    setPerCustomerLimit(coupon.perCustomerLimit !== undefined ? String(coupon.perCustomerLimit) : "");
    setExpiresAt(coupon.expiresAt ? coupon.expiresAt.slice(0, 10) : "");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const payload = {
        code,
        type,
        value,
        minOrderValue,
        maxDiscountAmount: maxDiscountAmount === "" ? null : Number(maxDiscountAmount),
        usageLimit: usageLimit === "" ? null : Number(usageLimit),
        perCustomerLimit: perCustomerLimit === "" ? null : Number(perCustomerLimit),
        expiresAt: expiresAt === "" ? null : expiresAt,
      };
      if (editing) {
        await api.put(`/coupons/${editing._id}`, payload);
      } else {
        await api.post("/coupons", payload);
      }
      resetForm();
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function toggleActive(coupon: Coupon) {
    try {
      await api.patch(`/coupons/${coupon._id}/active`, { isActive: !coupon.isActive });
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function remove(coupon: Coupon) {
    if (
      !(await confirmDialog({
        title: `Delete coupon ${coupon.code}?`,
        message: "Guests can no longer apply it. Bills that already used it keep their discount.",
        confirmLabel: "Delete coupon",
      }))
    )
      return;
    try {
      await api.delete(`/coupons/${coupon._id}`);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  function describe(coupon: Coupon) {
    const amount = coupon.type === "percent" ? `${coupon.value}% off` : `₹${coupon.value.toFixed(2)} off`;
    const parts = [amount];
    if (coupon.type === "percent" && coupon.maxDiscountAmount)
      parts.push(`up to ₹${coupon.maxDiscountAmount.toFixed(2)}`);
    if (coupon.minOrderValue > 0) parts.push(`min order ₹${coupon.minOrderValue.toFixed(2)}`);
    return parts.join(" · ");
  }

  function isExpired(coupon: Coupon) {
    return !!coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now();
  }

  const tourSteps: TourStep[] = useMemo(
    () => [
      {
        target: "coupon-form",
        title: "Add or edit a coupon",
        description:
          "Set the discount, a minimum order value, an optional cap on the discount, an overall usage limit, a per-customer limit and an expiry date.",
      },
      {
        target: "coupon-list",
        title: "All coupons",
        description: "See how much each coupon has been used, activate/deactivate one, or delete it.",
      },
    ],
    []
  );
  usePageTour(tourSteps);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 sm:gap-6">
      <PageHeader
        title="Discount Coupons"
        description={
          <>
            Customers can apply a coupon code on their order/invoice screen; staff can also apply one from an order's
            detail page at billing time. A coupon needs a mobile number on the order before it can be applied.
          </>
        }
      />

      <Card data-tour="coupon-form">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <label className="flex flex-col text-sm font-medium text-slate-700">
              Code
              <Input
                className="mt-1.5 uppercase"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. WELCOME10"
                required
              />
            </label>
            <label className="flex flex-col text-sm font-medium text-slate-700">
              Type
              <Select className="mt-1.5" value={type} onChange={(e) => setType(e.target.value as CouponType)}>
                <option value="percent">Percent off</option>
                <option value="flat">Flat amount off</option>
              </Select>
            </label>
            <label className="flex flex-col text-sm font-medium text-slate-700">
              Value {type === "percent" ? "(%)" : "(₹)"}
              <Input
                className="mt-1.5"
                type="number"
                min={0}
                max={type === "percent" ? 100 : undefined}
                step="0.01"
                value={value}
                onChange={(e) => setValue(Number(e.target.value))}
                required
              />
            </label>
            <label className="flex flex-col text-sm font-medium text-slate-700">
              Min order value (₹)
              <Input
                className="mt-1.5"
                type="number"
                min={0}
                step="0.01"
                value={minOrderValue}
                onChange={(e) => setMinOrderValue(Number(e.target.value))}
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {type === "percent" && (
              <label className="flex flex-col text-sm font-medium text-slate-700">
                Max discount (₹, optional)
                <Input
                  className="mt-1.5"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="No cap"
                  value={maxDiscountAmount}
                  onChange={(e) => setMaxDiscountAmount(e.target.value)}
                />
              </label>
            )}
            <label className="flex flex-col text-sm font-medium text-slate-700">
              Usage limit (optional)
              <Input
                className="mt-1.5"
                type="number"
                min={1}
                placeholder="Unlimited"
                value={usageLimit}
                onChange={(e) => setUsageLimit(e.target.value)}
              />
            </label>
            <label className="flex flex-col text-sm font-medium text-slate-700">
              Max uses per customer (optional)
              <Input
                className="mt-1.5"
                type="number"
                min={1}
                placeholder="Unlimited"
                value={perCustomerLimit}
                onChange={(e) => setPerCustomerLimit(e.target.value)}
              />
            </label>
            <label className="flex flex-col text-sm font-medium text-slate-700">
              Expires on (optional)
              <Input className="mt-1.5" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </label>
          </div>

          <div className="flex gap-2">
            <Button type="submit">{editing ? "Update" : "Add coupon"}</Button>
            {editing && (
              <Button type="button" variant="secondary" onClick={resetForm}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Card>

      <ErrorText>{error}</ErrorText>

      <Card data-tour="coupon-list">
        <TableWrap>
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th>Usage</th>
                <th>Expires</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((coupon) => (
                <tr key={coupon._id} className="border-t border-slate-100">
                  <td className="font-semibold text-slate-800">{coupon.code}</td>
                  <td>{describe(coupon)}</td>
                  <td>
                    {coupon.usedCount}
                    {coupon.usageLimit ? ` / ${coupon.usageLimit}` : ""}
                    {coupon.perCustomerLimit && (
                      <span className="block text-xs text-slate-500">
                        Max {coupon.perCustomerLimit}/customer
                      </span>
                    )}
                  </td>
                  <td>{coupon.expiresAt ? new Date(coupon.expiresAt).toLocaleDateString() : "-"}</td>
                  <td>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone={coupon.isActive ? "green" : "gray"}>{coupon.isActive ? "Active" : "Inactive"}</Badge>
                      {isExpired(coupon) && <Badge tone="red">Expired</Badge>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap">
                    <button
                      className="rounded-md px-2 py-1 text-sm font-medium transition-colors text-orange-700 hover:bg-orange-50"
                      onClick={() => edit(coupon)}
                    >
                      Edit
                    </button>
                    <button
                      className="rounded-md px-2 py-1 text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100"
                      onClick={() => toggleActive(coupon)}
                    >
                      {coupon.isActive ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      className="rounded-md px-2 py-1 text-sm font-medium transition-colors text-red-600 hover:bg-red-50"
                      onClick={() => remove(coupon)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {coupons.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-sm text-slate-500">
                    No coupons yet.
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
