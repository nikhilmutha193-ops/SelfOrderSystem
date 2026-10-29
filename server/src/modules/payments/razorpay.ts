import crypto from "crypto";

import { HttpError } from "../../utils/httpError";
import { describeError, logger } from "../../utils/logger";

// The few Razorpay REST calls we need (https://razorpay.com/docs/api/), over fetch so there is
// no SDK dependency. Amounts are in paise.

const API = "https://api.razorpay.com/v1";
const UNAVAILABLE = "Online payment isn't available right now. Please pay at the counter.";

export interface RazorpayCredentials {
  keyId: string;
  keySecret: string;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

export interface RazorpayPayment {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  /** created → authorized → captured, or failed / refunded. */
  status: string;
  method?: string;
}

async function call<T>(creds: RazorpayCredentials, method: "GET" | "POST", path: string, body?: object): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString("base64")}`,
        ...(body && { "Content-Type": "application/json" }),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    logger.error("razorpay: request failed", { path, ...describeError(err) });
    throw new HttpError(409, UNAVAILABLE);
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } };
  if (res.status === 401) throw new HttpError(409, "The Razorpay keys were rejected. Check them under Settings → Billing.");
  if (!res.ok) {
    logger.error("razorpay: request refused", { path, status: res.status, error: data.error?.description });
    throw new HttpError(409, UNAVAILABLE);
  }
  return data;
}

export function createRazorpayOrder(
  creds: RazorpayCredentials,
  input: { amount: number; receipt: string; notes: Record<string, string> }
) {
  return call<RazorpayOrder>(creds, "POST", "/orders", { ...input, currency: "INR" });
}

export function fetchRazorpayPayment(creds: RazorpayCredentials, paymentId: string) {
  return call<RazorpayPayment>(creds, "GET", `/payments/${encodeURIComponent(paymentId)}`);
}

export function captureRazorpayPayment(creds: RazorpayCredentials, paymentId: string, amount: number) {
  return call<RazorpayPayment>(creds, "POST", `/payments/${encodeURIComponent(paymentId)}/capture`, {
    amount,
    currency: "INR",
  });
}

/** Any authenticated read: a 401 means the keys are wrong. */
export async function checkRazorpayKeys(creds: RazorpayCredentials): Promise<void> {
  await call(creds, "GET", "/orders?count=1");
}

function hmacMatches(secret: string, payload: string | Buffer, signature: unknown): boolean {
  if (typeof signature !== "string" || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

/** The signature Checkout returns to the browser: HMAC-SHA256 of "order_id|payment_id" with the key secret. */
export function checkoutSignatureMatches(keySecret: string, orderId: string, paymentId: string, signature: unknown) {
  return hmacMatches(keySecret, `${orderId}|${paymentId}`, signature);
}

/** The X-Razorpay-Signature header: HMAC-SHA256 of the raw request body with the webhook secret. */
export function webhookSignatureMatches(webhookSecret: string, rawBody: Buffer, signature: unknown) {
  return hmacMatches(webhookSecret, rawBody, signature);
}
