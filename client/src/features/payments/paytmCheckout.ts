import type { PaytmOnlineCheckout } from "../../lib/types";

// Paytm Checkout (https://business.paytm.com/docs/jscheckout-initialize/). The script comes from Paytm's own server for
// this merchant and is loaded only when someone taps "Pay online".

interface PaytmCheckoutJs {
  onLoad: (callback: () => void) => void;
  init: (config: Record<string, unknown>) => Promise<void>;
  invoke: () => void;
  close: () => void;
}

declare global {
  interface Window {
    Paytm?: { CheckoutJS?: PaytmCheckoutJs };
  }
}

export type PaytmOutcome = { kind: "finished" } | { kind: "dismissed" } | { kind: "failed"; message: string };

const loading = new Map<string, Promise<PaytmCheckoutJs>>();

function loadScript(host: string, mid: string): Promise<PaytmCheckoutJs> {
  const src = `${host}/merchantpgpui/checkoutjs/merchants/${encodeURIComponent(mid)}.js`;
  const cached = loading.get(src);
  if (cached) return cached;
  const promise = new Promise<PaytmCheckoutJs>((resolve, reject) => {
    const fail = () => {
      loading.delete(src);
      reject(new Error("Couldn't load the payment page. Check your connection, or pay at the counter."));
    };
    const ready = () => {
      const checkout = window.Paytm?.CheckoutJS;
      if (checkout) checkout.onLoad(() => resolve(checkout));
      else fail();
    };
    if (window.Paytm?.CheckoutJS) return ready();
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = ready;
    script.onerror = () => {
      script.remove();
      fail();
    };
    document.head.appendChild(script);
  });
  loading.set(src, promise);
  return promise;
}

/**
 * Opens Paytm Checkout and resolves once the payment finishes (the server still asks Paytm whether it succeeded),
 * the guest closes it, or it fails.
 */
export async function openPaytmCheckout(checkout: PaytmOnlineCheckout): Promise<PaytmOutcome> {
  const paytm = await loadScript(checkout.host, checkout.mid);
  return new Promise<PaytmOutcome>((resolve, reject) => {
    let done = false;
    const finish = (outcome: PaytmOutcome) => {
      if (done) return;
      done = true;
      resolve(outcome);
    };
    paytm
      .init({
        root: "",
        flow: "DEFAULT",
        data: {
          orderId: checkout.gatewayOrderId,
          token: checkout.txnToken,
          tokenType: "TXN_TOKEN",
          amount: (checkout.amount / 100).toFixed(2),
        },
        merchant: { mid: checkout.mid, name: checkout.name, redirect: false },
        handler: {
          transactionStatus: (data: { STATUS?: string; RESPMSG?: string }) => {
            paytm.close();
            if (data?.STATUS === "TXN_FAILURE") finish({ kind: "failed", message: data.RESPMSG || "The payment didn't go through." });
            else finish({ kind: "finished" });
          },
          notifyMerchant: (event: string) => {
            if (event === "APP_CLOSED") finish({ kind: "dismissed" });
          },
        },
      })
      .then(() => paytm.invoke())
      .catch((err: unknown) => {
        if (!done) {
          done = true;
          reject(err instanceof Error ? err : new Error("Couldn't open the payment page. Please pay at the counter."));
        }
      });
  });
}
