import { ArrowRightLeft, BadgePercent, Combine, HandCoins, Split, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import type { OrderDetailResponse } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { Dialog } from "../../../shared/ui/Dialog";
import { Button, ErrorText, Input, Select, Textarea } from "../../../shared/ui/ui";
import {
  useFreeTables,
  useMergeOrder,
  useOrders,
  useSetDiscount,
  useSetServiceCharge,
  useSplitOrder,
  useTransferOrder,
} from "../queries";
import { orderTypeLabel } from "../status";

type Panel = "split" | "merge" | "move" | "discount" | null;

function ActionDialog({
  title,
  children,
  onClose,
  onSubmit,
  submitLabel,
  busy,
  error,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  busy: boolean;
  error: string | null;
}) {
  return (
    <Dialog
      open
      title={title}
      onClose={onClose}
      dismissible={!busy}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Close
          </Button>
          <Button type="submit" loading={busy}>
            {busy ? "Saving..." : submitLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {children}
        <ErrorText>{error}</ErrorText>
      </div>
    </Dialog>
  );
}

export default function BillActions({ data }: { data: OrderDetailResponse }) {
  const { order, items, totals } = data;
  const navigate = useNavigate();
  const [panel, setPanel] = useState<Panel>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosenItems, setChosenItems] = useState<string[]>([]);
  const [target, setTarget] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "flat">("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");

  const split = useSplitOrder();
  const merge = useMergeOrder();
  const move = useTransferOrder();
  const discount = useSetDiscount();
  const serviceCharge = useSetServiceCharge();
  const unpaid = useOrders({ status: "open" }, { enabled: panel === "merge" });
  const freeTables = useFreeTables(panel === "move");

  const isOpen = order.status === "open";
  const activeItems = items.filter((i) => i.status !== "cancelled");
  const canMove = order.orderType === "dine-in" && (order.status === "open" || order.status === "billed");
  const hasServiceCharge = (totals.serviceChargePercent ?? 0) > 0 || !!order.serviceChargeWaived;
  if (!isOpen && !canMove) return null;

  function openPanel(next: Panel) {
    setError(null);
    setChosenItems([]);
    setTarget("");
    setPanel(next);
  }

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      setPanel(null);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  const busy = split.isPending || merge.isPending || move.isPending || discount.isPending;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {isOpen && activeItems.length > 1 && (
          <Button variant="secondary" size="sm" icon={Split} onClick={() => openPanel("split")}>
            Split bill
          </Button>
        )}
        {isOpen && (
          <Button variant="secondary" size="sm" icon={Combine} onClick={() => openPanel("merge")}>
            Merge into another order
          </Button>
        )}
        {canMove && (
          <Button variant="secondary" size="sm" icon={ArrowRightLeft} onClick={() => openPanel("move")}>
            Move table
          </Button>
        )}
        {isOpen && (
          <Button variant="secondary" size="sm" icon={BadgePercent} onClick={() => openPanel("discount")}>
            {order.manualDiscount ? "Change discount" : "Give discount"}
          </Button>
        )}
        {isOpen && order.manualDiscount && (
          <Button
            variant="secondary"
            size="sm"
            icon={X}
            onClick={() => run(() => discount.mutateAsync({ orderId: order._id, input: null }))}
          >
            Remove discount
          </Button>
        )}
        {isOpen && hasServiceCharge && (
          <Button
            variant="secondary"
            size="sm"
            icon={HandCoins}
            onClick={() =>
              run(() => serviceCharge.mutateAsync({ orderId: order._id, waived: !order.serviceChargeWaived }))
            }
          >
            {order.serviceChargeWaived ? "Add service charge back" : "Remove service charge"}
          </Button>
        )}
      </div>
      {!panel && <ErrorText>{error}</ErrorText>}

      {panel === "split" && (
        <ActionDialog
          title="Move items to a new bill"
          submitLabel="Create new bill"
          busy={busy}
          error={error}
          onClose={() => setPanel(null)}
          onSubmit={() =>
            run(async () => {
              if (chosenItems.length === 0) throw new Error("Choose at least one item to move");
              const result = await split.mutateAsync({ orderId: order._id, itemIds: chosenItems });
              navigate(`/admin/orders/${result.created._id}`);
            })
          }
        >
          <p className="text-sm text-slate-600">Ticked items move to a separate bill on the same table.</p>
          <div className="flex flex-col gap-1">
            {activeItems.map((item) => (
              <label key={item._id} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  id={`split-${item._id}`}
                  type="checkbox"
                  className="h-4 w-4 accent-orange-600"
                  checked={chosenItems.includes(item._id)}
                  onChange={(e) =>
                    setChosenItems((prev) =>
                      e.target.checked ? [...prev, item._id] : prev.filter((id) => id !== item._id)
                    )
                  }
                />
                <span className="flex-1">
                  {item.foodName} x{item.quantity}
                </span>
                <span className="tabular-nums">₹{item.total.toFixed(2)}</span>
              </label>
            ))}
          </div>
        </ActionDialog>
      )}

      {panel === "merge" && (
        <ActionDialog
          title="Merge into another order"
          submitLabel="Merge"
          busy={busy}
          error={error}
          onClose={() => setPanel(null)}
          onSubmit={() =>
            run(async () => {
              if (!target) throw new Error("Choose the order to merge into");
              await merge.mutateAsync({ orderId: order._id, intoOrderId: target });
              navigate(`/admin/orders/${target}`);
            })
          }
        >
          <p className="text-sm text-slate-600">
            Every item on this order moves to the one you choose. This order is then closed as merged.
          </p>
          <Select id="merge-target" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Choose an open order</option>
            {(unpaid.data ?? [])
              .filter((o) => o._id !== order._id)
              .map((o) => (
                <option key={o._id} value={o._id}>
                  {o.customerName} ·{" "}
                  {typeof o.tableId === "object" && o.tableId?.code ? `Table ${o.tableId.code}` : orderTypeLabel(o)}
                </option>
              ))}
          </Select>
        </ActionDialog>
      )}

      {panel === "move" && (
        <ActionDialog
          title="Move to another table"
          submitLabel="Move"
          busy={busy}
          error={error}
          onClose={() => setPanel(null)}
          onSubmit={() =>
            run(async () => {
              if (!target) throw new Error("Choose a table");
              await move.mutateAsync({ orderId: order._id, tableId: target });
            })
          }
        >
          <p className="text-sm text-slate-600">
            Guests at the old table are signed out of their phones and can rescan the QR at the new table.
          </p>
          <Select id="move-target" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">{freeTables.data?.length === 0 ? "No free tables" : "Choose a free table"}</option>
            {(freeTables.data ?? []).map((t) => (
              <option key={t._id} value={t._id}>
                Table {t.code}
              </option>
            ))}
          </Select>
        </ActionDialog>
      )}

      {panel === "discount" && (
        <ActionDialog
          title="Give a discount"
          submitLabel="Apply discount"
          busy={busy}
          error={error}
          onClose={() => setPanel(null)}
          onSubmit={() =>
            run(() =>
              discount.mutateAsync({
                orderId: order._id,
                input: { type: discountType, value: Number(discountValue), reason: discountReason.trim() },
              })
            )
          }
        >
          <div className="flex gap-2">
            <Select
              id="discount-type"
              className="!w-32"
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as "percent" | "flat")}
            >
              <option value="percent">Percent</option>
              <option value="flat">Rupees</option>
            </Select>
            <Input
              id="discount-value"
              type="number"
              min={0}
              step="0.01"
              placeholder={discountType === "percent" ? "10" : "50"}
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
            />
          </div>
          <label className="text-sm font-medium text-slate-700">
            Reason
            <Textarea
              id="discount-reason"
              className="mt-1"
              rows={2}
              maxLength={200}
              value={discountReason}
              onChange={(e) => setDiscountReason(e.target.value)}
              placeholder="Regular guest, service delay..."
            />
          </label>
          <p className="text-xs text-slate-500">Staff discounts are capped by the limit in Restaurant Settings.</p>
        </ActionDialog>
      )}
    </div>
  );
}
