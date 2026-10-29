import { useQueryClient } from "@tanstack/react-query";
import { CreditCard } from "lucide-react";
import { useState } from "react";

import { extractErrorMessage } from "../../../shared/api/client";
import { Button, ErrorText } from "../../../shared/ui/ui";
import { orderKeys } from "../../orders/queries";
import { paymentsApi } from "../api";
import { brandThemeColor, openRazorpayCheckout } from "../razorpayCheckout";

/** "Pay ₹X now" for a guest's own order: Razorpay Checkout, then the server settles the order. */
export function PayOnlineButton({ orderId, amount }: { orderId: string; amount: number }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const checkout = await paymentsApi.checkout(orderId);
      const outcome = await openRazorpayCheckout(checkout, brandThemeColor());
      if (outcome.kind === "dismissed") return;
      if (outcome.kind === "failed") {
        setError(`${outcome.message} You weren't charged. Try again or pay at the counter.`);
        return;
      }
      const { status } = await paymentsApi.confirm(outcome.confirmation);
      if (status === "mismatch" || status === "duplicate") {
        setNotice("Your payment went through. Please show it at the counter so they can finish your order.");
      } else if (status === "processing") {
        setNotice("Your payment went through. Confirming it with the restaurant...");
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
      await queryClient.invalidateQueries({ queryKey: orderKeys.all });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button icon={CreditCard} loading={busy} onClick={pay} className="w-full sm:w-auto">
        Pay ₹{amount.toFixed(2)} now
      </Button>
      <p className="text-xs text-slate-500">UPI, cards, net banking and wallets, by Razorpay.</p>
      {notice && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</p>}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
