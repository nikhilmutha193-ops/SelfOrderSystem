import type { OnlineCheckout } from "../../lib/types";
import type { RazorpayConfirmation } from "./api";

// Razorpay Standard Checkout (https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/).
// The script is loaded only when a guest taps "Pay now".

const SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

interface RazorpayInstance {
  open: () => void;
  on: (event: "payment.failed", handler: (response: { error?: { description?: string } }) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let loading: Promise<void> | null = null;

/** The restaurant's brand colour (shared/brand.ts), so Checkout matches the app. */
export function brandThemeColor(): string | undefined {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--brand-600").trim();
  return /^#[0-9a-f]{6}$/i.test(value) ? value : undefined;
}

function loadScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error("Couldn't load the payment page. Check your connection, or pay at the counter."));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export type CheckoutOutcome =
  | { kind: "paid"; confirmation: RazorpayConfirmation }
  | { kind: "dismissed" }
  | { kind: "failed"; message: string };

/** Opens Checkout and resolves once the guest pays, closes it, or the payment fails. */
export async function openRazorpayCheckout(checkout: OnlineCheckout, themeColor?: string): Promise<CheckoutOutcome> {
  await loadScript();
  const Razorpay = window.Razorpay;
  if (!Razorpay) throw new Error("Couldn't load the payment page. Please pay at the counter.");

  return new Promise<CheckoutOutcome>((resolve) => {
    let settled = false;
    // Checkout stays open after a failed attempt so the guest can try again; report the failure
    // only if they then close it.
    let lastError: string | null = null;
    const finish = (outcome: CheckoutOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };
    const instance = new Razorpay({
      key: checkout.keyId,
      amount: checkout.amount,
      currency: checkout.currency,
      order_id: checkout.gatewayOrderId,
      name: checkout.name,
      description: checkout.description,
      prefill: checkout.prefill,
      ...(themeColor && { theme: { color: themeColor } }),
      handler: (confirmation: RazorpayConfirmation) => finish({ kind: "paid", confirmation }),
      modal: {
        ondismiss: () => finish(lastError ? { kind: "failed", message: lastError } : { kind: "dismissed" }),
      },
    });
    instance.on("payment.failed", (response) => {
      lastError = response.error?.description || "The payment didn't go through.";
    });
    instance.open();
  });
}
