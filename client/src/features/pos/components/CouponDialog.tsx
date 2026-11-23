import { useState } from "react";

import type { Order, OrderCoupon } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { Dialog } from "../../../shared/ui/Dialog";
import { Badge, Button, ErrorText, Input } from "../../../shared/ui/ui";
import { useApplyCoupon, useOrderCoupons, useRemoveCoupon } from "../../orders/queries";

const rupees = (n: number) => `₹${n.toFixed(2)}`;
const NO_COUPONS: OrderCoupon[] = [];

function offerText(c: OrderCoupon) {
  const off = c.type === "percent" ? `${c.value}% off` : `${rupees(c.value)} off`;
  const cap = c.type === "percent" && c.maxDiscountAmount ? `, up to ${rupees(c.maxDiscountAmount)}` : "";
  const min = c.minOrderValue > 0 ? ` · minimum ${rupees(c.minOrderValue)}` : "";
  return `${off}${cap}${min}`;
}

/** Coupons the open order can use: pick one to apply it, or take the applied one off. */
export function CouponDialog({
  open,
  onClose,
  order,
  subtotal,
}: {
  open: boolean;
  onClose: () => void;
  order: Order;
  subtotal: number;
}) {
  const offers = useOrderCoupons(open ? order._id : undefined, subtotal);
  const apply = useApplyCoupon();
  const remove = useRemoveCoupon();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const coupons = offers.data ?? NO_COUPONS;
  const busy = apply.isPending || remove.isPending;

  async function run(action: () => Promise<unknown>, done?: () => void) {
    setError(null);
    try {
      await action();
      done?.();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  const applyCode = (value: string) =>
    run(
      () => apply.mutateAsync({ orderId: order._id, code: value.trim().toUpperCase() }),
      () => {
        setCode("");
        onClose();
      },
    );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title="Coupons"
      description={`Bill so far ${rupees(subtotal)}. A coupon needs the customer's mobile number on the order.`}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <ErrorText>{error}</ErrorText>

        {order.couponCode && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
            <span>
              <span className="font-semibold">{order.couponCode}</span> is applied
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="!text-red-600 hover:!bg-red-50"
              loading={remove.isPending}
              onClick={() => run(() => remove.mutateAsync(order._id))}
            >
              Remove
            </Button>
          </div>
        )}

        {offers.isLoading && <p className="text-slate-500">Loading coupons...</p>}
        {!offers.isLoading && coupons.length === 0 && <p className="text-slate-500">No coupons are available right now.</p>}

        <ul className="flex flex-col gap-2">
          {coupons.map((c) => {
            const applied = order.couponCode === c.code;
            return (
              <li
                key={c.code}
                className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
                  applied ? "border-green-300 bg-green-50" : "border-slate-200"
                } ${!c.eligible ? "opacity-70" : ""}`}
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{c.code}</span>
                    {applied && <Badge tone="green">Applied</Badge>}
                  </span>
                  <span className="block text-xs text-slate-500">{offerText(c)}</span>
                  <span className={`block text-xs ${c.eligible ? "font-medium text-green-700" : "text-amber-700"}`}>
                    {c.eligible ? `Saves ${rupees(c.discount)}` : c.reason}
                  </span>
                </span>
                <Button size="sm" disabled={!c.eligible || applied || busy} onClick={() => applyCode(c.code)}>
                  Apply
                </Button>
              </li>
            );
          })}
        </ul>

        <form
          className="flex gap-2 border-t border-slate-100 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) void applyCode(code);
          }}
        >
          <Input
            aria-label="Coupon code"
            placeholder="Or type a coupon code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <Button type="submit" variant="secondary" disabled={!code.trim() || busy}>
            Apply
          </Button>
        </form>
      </div>
    </Dialog>
  );
}

/** One line in the order panel's totals: the coupon on the order, or a button to pick one. */
export function CouponRow({ order, subtotal, discount }: { order: Order; subtotal: number; discount: number }) {
  const [open, setOpen] = useState(false);
  const offers = useOrderCoupons(order._id, subtotal);
  const usable = (offers.data ?? NO_COUPONS).filter((c) => c.eligible).length;
  const available = (offers.data ?? NO_COUPONS).length;

  return (
    <>
      <div className="flex items-center justify-between gap-2 text-slate-600">
        <span>{order.couponCode ? `Coupon ${order.couponCode}` : "Coupon"}</span>
        <span className="flex items-center gap-2 tabular-nums">
          {order.couponCode && discount > 0 && <span className="text-green-700">−{rupees(discount)}</span>}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-md border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            {order.couponCode ? "Change" : available > 0 ? `Coupons (${usable}/${available})` : "Coupons"}
          </button>
        </span>
      </div>
      <CouponDialog open={open} onClose={() => setOpen(false)} order={order} subtotal={subtotal} />
    </>
  );
}
