import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useMyOrders, useOrder } from "../features/orders/queries";
import { useDineInPayment } from "../lib/useDineInPayment";
import { useServiceFlow } from "../lib/useServiceFlow";
import { useTableSession } from "../lib/useTableSession";
import { api, clearStoredToken, setActiveAuth } from "../shared/api/client";
import { POLL } from "../shared/api/queryClient";
import { Dialog } from "../shared/ui/Dialog";
import { Button } from "../shared/ui/ui";

/** Keep in step with SERVED_RELEASE_MINUTES on the server, which releases the table by itself after this long. */
const COUNTDOWN_SECONDS = 120;

/**
 * Pay-first service: once every order of this table session is paid and every dish is served, ask the guest
 * whether to release the table. It is released by itself after two minutes (here, and by the server's
 * scheduler if the page is closed). Ordering more starts a new order, which keeps the table.
 */
export function ServedReleasePrompt() {
  const { orderId, tableId, via } = useTableSession();
  const navigate = useNavigate();
  const dineInPayment = useDineInPayment();
  const serviceFlow = useServiceFlow();
  const payFirst = dineInPayment === "upfront" || serviceFlow === "cafe";
  const active = payFirst && !!orderId && !!tableId && via !== "token";
  const mine = useMyOrders(active, POLL.guestInvoice);
  const orders = mine.data;
  // The current order is already polled by the guest pages. When it changes (an item served, the bill paid)
  // the list of all rounds is fetched again at once instead of waiting for its own timer.
  const current = useOrder(active ? orderId : undefined, POLL.guestInvoice).data;
  const currentSignature = current
    ? `${current.order.status}:${current.items.map((i) => i.status).join(",")}`
    : "";
  const { refetch } = mine;
  useEffect(() => {
    if (active && currentSignature) void refetch();
  }, [active, currentSignature, refetch]);
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const releasing = useRef(false);

  const live = (orders ?? []).filter((o) => o.status !== "cancelled" && o.itemCount > 0);
  const allServed = live.length > 0 && live.every((o) => o.status === "closed" && o.served);
  // A new round changes this, so the prompt can come back after a dismissal.
  const signature = live.map((o) => o.orderId).join(",");
  const open = allServed && dismissedFor !== signature;

  useEffect(() => {
    if (!open) {
      setSecondsLeft(COUNTDOWN_SECONDS);
      return;
    }
    const timer = setInterval(() => setSecondsLeft((s) => Math.max(s - 1, 0)), 1000);
    return () => clearInterval(timer);
  }, [open]);

  async function release() {
    if (releasing.current) return;
    releasing.current = true;
    try {
      await api.patch("/tables/session/release");
    } catch {
      // The server may have released it already.
    }
    clearStoredToken("table");
    setActiveAuth(null);
    try {
      localStorage.removeItem("selforder_table_code");
    } catch {
      // Not critical.
    }
    navigate("/order", { replace: true });
  }

  useEffect(() => {
    if (open && secondsLeft === 0) void release();
    // release only reads a ref and navigate, so it must not restart the countdown
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, secondsLeft]);

  const clock = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;

  return (
    <Dialog
      open={open}
      onClose={() => setDismissedFor(signature)}
      title="Everything has been served"
      description="Your orders are paid and served. Release the table so the next guests can sit down."
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setDismissedFor(signature);
              navigate("/order/menu");
            }}
          >
            Order more
          </Button>
          <Button type="button" onClick={() => void release()}>
            Release table
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">
        The table is released automatically in <span className="font-semibold tabular-nums">{clock}</span>. Order more
        to keep it.
      </p>
    </Dialog>
  );
}
