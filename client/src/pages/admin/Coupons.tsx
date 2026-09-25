import { useEffect, useState } from "react";

import { Badge, Button, Card, ErrorText, Input, Select, TableWrap } from "../../components/ui";
import { api, extractErrorMessage } from "../../lib/apiClient";
import type { Coupon, CouponType } from "../../lib/types";

export default function Coupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [code, setCode] = useState("");
  const [type, setType] = useState<CouponType>("percent");
  const [value, setValue] = useState<number>(10);
  const [minOrderValue, setMinOrderValue] = useState<number>(0);
  const [maxDiscountAmount, setMaxDiscountAmount] = useState<string>("");
  const [usageLimit, setUsageLimit] = useState<string>("");
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
    if (!confirm(`Delete coupon "${coupon.code}"?`)) return;
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

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-800">Discount Coupons</h1>
      <p className="text-sm text-slate-500">
        Customers can apply a coupon code on their order/invoice screen; staff can also apply one from an order's detail
        page at billing time.
      </p>

      <Card>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm font-medium text-slate-700">
              Code
              <Input
                className="mt-1 w-36 uppercase"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. WELCOME10"
                required
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Type
              <Select className="mt-1" value={type} onChange={(e) => setType(e.target.value as CouponType)}>
                <option value="percent">Percent off</option>
                <option value="flat">Flat amount off</option>
              </Select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Value {type === "percent" ? "(%)" : "(₹)"}
              <Input
                className="mt-1 w-28"
                type="number"
                min={0}
                max={type === "percent" ? 100 : undefined}
                step="0.01"
                value={value}
                onChange={(e) => setValue(Number(e.target.value))}
                required
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Min order value (₹)
              <Input
                className="mt-1 w-32"
                type="number"
                min={0}
                step="0.01"
                value={minOrderValue}
                onChange={(e) => setMinOrderValue(Number(e.target.value))}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            {type === "percent" && (
              <label className="text-sm font-medium text-slate-700">
                Max discount (₹, optional)
                <Input
                  className="mt-1 w-36"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="No cap"
                  value={maxDiscountAmount}
                  onChange={(e) => setMaxDiscountAmount(e.target.value)}
                />
              </label>
            )}
            <label className="text-sm font-medium text-slate-700">
              Usage limit (optional)
              <Input
                className="mt-1 w-32"
                type="number"
                min={1}
                placeholder="Unlimited"
                value={usageLimit}
                onChange={(e) => setUsageLimit(e.target.value)}
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Expires on (optional)
              <Input className="mt-1" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
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

      <Card>
        <TableWrap>
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-2">Code</th>
                <th className="pb-2">Discount</th>
                <th className="pb-2">Usage</th>
                <th className="pb-2">Expires</th>
                <th className="pb-2">Status</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((coupon) => (
                <tr key={coupon._id} className="border-t border-slate-100">
                  <td className="py-1.5 font-semibold text-slate-800">{coupon.code}</td>
                  <td className="py-1.5">{describe(coupon)}</td>
                  <td className="py-1.5">
                    {coupon.usedCount}
                    {coupon.usageLimit ? ` / ${coupon.usageLimit}` : ""}
                  </td>
                  <td className="py-1.5">{coupon.expiresAt ? new Date(coupon.expiresAt).toLocaleDateString() : "-"}</td>
                  <td className="py-1.5">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone={coupon.isActive ? "green" : "gray"}>{coupon.isActive ? "Active" : "Inactive"}</Badge>
                      {isExpired(coupon) && <Badge tone="red">Expired</Badge>}
                    </div>
                  </td>
                  <td className="flex gap-2 py-1.5">
                    <button className="text-orange-600 hover:underline" onClick={() => edit(coupon)}>
                      Edit
                    </button>
                    <button className="text-slate-600 hover:underline" onClick={() => toggleActive(coupon)}>
                      {coupon.isActive ? "Deactivate" : "Activate"}
                    </button>
                    <button className="text-red-600 hover:underline" onClick={() => remove(coupon)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {coupons.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-slate-400">
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
