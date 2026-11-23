import type { OnlineCheckout, PaymentAttemptStatus } from "../../lib/types";
import type { RazorpayConfirmation } from "./api";
import { paymentsApi } from "./api";
import { openPaytmCheckout } from "./paytmCheckout";
import { brandThemeColor, openRazorpayCheckout } from "./razorpayCheckout";

export type OnlineOutcome =
  | { kind: "dismissed" }
  | { kind: "failed"; message: string }
  | { kind: "done"; status: PaymentAttemptStatus };

/**
 * One online payment, whichever gateway the restaurant uses (Razorpay or Paytm): opens its Checkout and, once the
 * guest has paid, asks the server to confirm it. The server settles the order only on the gateway's own word.
 * `calls` lets the kiosk use its own endpoints and `around` lets a screen note that a checkout is open.
 */
export async function payOnline(
  orderId: string,
  calls: {
    checkout?: (orderId: string) => Promise<OnlineCheckout>;
    confirmRazorpay?: (input: RazorpayConfirmation) => Promise<{ status: PaymentAttemptStatus }>;
    confirmPaytm?: (gatewayOrderId: string) => Promise<{ status: PaymentAttemptStatus }>;
  } = {},
  around: <T>(open: () => Promise<T>) => Promise<T> = (open) => open()
): Promise<OnlineOutcome> {
  const checkout = await (calls.checkout ?? paymentsApi.checkout)(orderId);
  if (checkout.provider === "paytm") {
    const outcome = await around(() => openPaytmCheckout(checkout));
    if (outcome.kind === "dismissed") return outcome;
    if (outcome.kind === "failed") return outcome;
    const confirm = calls.confirmPaytm ?? paymentsApi.confirmPaytm;
    return { kind: "done", status: (await confirm(checkout.gatewayOrderId)).status };
  }
  const outcome = await around(() => openRazorpayCheckout(checkout, brandThemeColor()));
  if (outcome.kind === "dismissed" || outcome.kind === "failed") return outcome;
  const confirm = calls.confirmRazorpay ?? paymentsApi.confirm;
  return { kind: "done", status: (await confirm(outcome.confirmation)).status };
}
