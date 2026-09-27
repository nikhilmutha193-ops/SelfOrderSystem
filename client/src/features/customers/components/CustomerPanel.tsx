import { MessageCircle, Star, UserSearch } from "lucide-react";
import { useState } from "react";

import type { Order } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { Button, ErrorText, Input } from "../../../shared/ui/ui";
import { customersApi } from "../api";
import { useAttachCustomer, useOrderCustomer, useRedeemPoints, useRemoveRedemption } from "../queries";

function formatPhone(phone: string) {
  return phone.length === 12 && phone.startsWith("91") ? `+91 ${phone.slice(2, 7)} ${phone.slice(7)}` : `+${phone}`;
}

export function WhatsAppBillButton({ orderId, compact = false }: { orderId: string; compact?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="secondary"
        icon={MessageCircle}
        loading={busy}
        className={compact ? "w-full" : "w-full sm:w-auto"}
        onClick={async () => {
          setError(null);
          setBusy(true);
          const tab = window.open("", "_blank");
          try {
            const share = await customersApi.shareBill(orderId);
            if (tab) tab.location.href = share.whatsappUrl;
            else window.location.href = share.whatsappUrl;
          } catch (err) {
            tab?.close();
            setError(extractErrorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        Send bill on WhatsApp
      </Button>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

export function CustomerPanel({
  order,
  compact = false,
}: {
  order: Pick<Order, "_id" | "status" | "invoiceNumber">;
  compact?: boolean;
}) {
  const data = useOrderCustomer(order._id).data;
  const attach = useAttachCustomer();
  const redeem = useRedeemPoints();
  const remove = useRemoveRedemption();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [points, setPoints] = useState("");
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const customer = data?.customer ?? null;
  const loyalty = data?.loyalty;
  const redeemed = data?.redeem ?? null;
  const isOpen = order.status === "open";
  const billed = !!order.invoiceNumber && (order.status === "billed" || order.status === "closed");

  async function run(action: () => Promise<unknown>, after?: () => void) {
    setError(null);
    try {
      await action();
      after?.();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  const canAttach = order.status === "open" || order.status === "billed";

  return (
    <div className={`flex flex-col gap-2 ${compact ? "text-sm" : ""}`} data-testid="customer-panel">
      {customer && !changing ? (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-700">
            {(customer.name || "G").slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-800">
              {customer.name || "Guest"}{" "}
              <span className="font-normal text-slate-500">{formatPhone(customer.phone)}</span>
            </p>
            <p className="text-xs text-slate-500">
              {customer.visitCount === 0
                ? "First visit"
                : `${customer.visitCount} visit${customer.visitCount === 1 ? "" : "s"}`}{" "}
              · spent ₹{customer.totalSpend.toFixed(0)}
              {loyalty?.enabled && (
                <>
                  {" "}
                  · <span className="font-semibold text-orange-700">{customer.points} points</span> (₹
                  {customer.pointsValue.toFixed(0)})
                </>
              )}
            </p>
          </div>
          {canAttach && !redeemed && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setChanging(true)}>
              Change
            </Button>
          )}
        </div>
      ) : canAttach ? (
        <form
          className={`grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-[1fr_1fr_auto]"}`}
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () => attach.mutateAsync({ orderId: order._id, phone, name: name.trim() || undefined }),
              () => {
                setPhone("");
                setName("");
                setChanging(false);
              }
            );
          }}
        >
          <Input
            id="customer-phone"
            type="tel"
            inputMode="tel"
            aria-label="Guest phone"
            placeholder="Guest phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Input
            aria-label="Guest name"
            placeholder="Name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            type="submit"
            variant="secondary"
            icon={UserSearch}
            className={compact ? "col-span-2" : "col-span-2 sm:col-span-1"}
            loading={attach.isPending}
            disabled={!phone.trim()}
          >
            Find guest
          </Button>
        </form>
      ) : (
        <p className="text-xs text-slate-400">No guest phone on this order.</p>
      )}

      {loyalty?.enabled &&
        customer &&
        isOpen &&
        (redeemed ? (
          <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <span>
              {redeemed.points} points used · −₹{redeemed.amount.toFixed(2)}
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="!text-red-600 hover:!bg-red-50"
              loading={remove.isPending}
              onClick={() => run(() => remove.mutateAsync(order._id))}
            >
              Remove
            </Button>
          </div>
        ) : (
          customer.points >= loyalty.minRedeem && (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run(
                  () => redeem.mutateAsync({ orderId: order._id, points: Number(points) }),
                  () => setPoints("")
                );
              }}
            >
              <Input
                id="redeem-points"
                className="!w-28"
                aria-label="Points to use"
                type="number"
                inputMode="numeric"
                min={loyalty.minRedeem}
                max={customer.points}
                placeholder={`${loyalty.minRedeem}–${customer.points}`}
                value={points}
                onChange={(e) => setPoints(e.target.value)}
              />
              <Button type="submit" variant="secondary" icon={Star} loading={redeem.isPending} disabled={!points}>
                Use points
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setPoints(String(customer.points))}>
                Use all
              </Button>
            </form>
          )
        ))}

      {billed && <WhatsAppBillButton orderId={order._id} compact={compact} />}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
