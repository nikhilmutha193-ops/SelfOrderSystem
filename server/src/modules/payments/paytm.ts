import crypto from "crypto";

import { HttpError } from "../../utils/httpError";
import { describeError, logger } from "../../utils/logger";

// The Paytm Payment Gateway calls we need (https://business.paytm.com/docs/api/), over fetch so there is no SDK
// dependency. Requests are signed with the merchant key the way Paytm's own checksum library does it.

export type PaytmEnvironment = "staging" | "production";

export interface PaytmCredentials {
  mid: string;
  merchantKey: string;
  /** "DEFAULT" on production, "WEBSTAGING" on the staging account (what the Paytm dashboard shows). */
  website: string;
  environment: PaytmEnvironment;
}

const HOSTS: Record<PaytmEnvironment, string> = {
  production: "https://securegw.paytm.in",
  staging: "https://securegw-stage.paytm.in",
};
const UNAVAILABLE = "Online payment isn't available right now. Please pay at the counter.";
// Paytm's fixed vector for its checksum cipher.
const IV = "@@@@&&&&####$$$$";

export const paytmHost = (environment: PaytmEnvironment) => HOSTS[environment];

/** Paytm's request signature: SHA-256 of the body and a random salt, encrypted with the merchant key (AES-128-CBC). */
export function generateSignature(payload: string, merchantKey: string, salt = crypto.randomBytes(3).toString("base64")): string {
  const hash = crypto.createHash("sha256").update(`${payload}|${salt}`).digest("hex") + salt;
  const cipher = crypto.createCipheriv("aes-128-cbc", merchantKey, IV);
  return Buffer.concat([cipher.update(hash, "utf8"), cipher.final()]).toString("base64");
}

/** Checks a signature Paytm sent (the webhook and callback carry one), whatever salt it used. */
export function verifySignature(payload: string, merchantKey: string, signature: unknown): boolean {
  if (typeof signature !== "string" || !signature) return false;
  try {
    const decipher = crypto.createDecipheriv("aes-128-cbc", merchantKey, IV);
    const hash = Buffer.concat([decipher.update(signature, "base64"), decipher.final()]).toString("utf8");
    const salt = hash.slice(-4);
    return hash === crypto.createHash("sha256").update(`${payload}|${salt}`).digest("hex") + salt;
  } catch {
    return false;
  }
}

interface PaytmResponse<B> {
  head?: Record<string, unknown>;
  body?: B & { resultInfo?: { resultStatus?: string; resultCode?: string; resultMsg?: string } };
}

async function call<B>(creds: PaytmCredentials, path: string, body: object): Promise<PaytmResponse<B>> {
  const payload = JSON.stringify(body);
  let res: Response;
  try {
    res = await fetch(`${HOSTS[creds.environment]}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, head: { signature: generateSignature(payload, creds.merchantKey) } }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    logger.error("paytm: request failed", { path, ...describeError(err) });
    throw new HttpError(409, UNAVAILABLE);
  }
  const data = (await res.json().catch(() => ({}))) as PaytmResponse<B>;
  if (!res.ok && !data.body?.resultInfo) {
    logger.error("paytm: request refused", { path, status: res.status });
    throw new HttpError(409, UNAVAILABLE);
  }
  return data;
}

export interface PaytmInitiated {
  txnToken: string;
}

/** Starts a Paytm transaction for one order and returns the token Checkout opens with. Amount is in rupees. */
export async function initiatePaytmTransaction(
  creds: PaytmCredentials,
  input: { orderId: string; amount: number; customerId: string }
): Promise<PaytmInitiated> {
  const host = HOSTS[creds.environment];
  const res = await call<{ txnToken?: string }>(
    creds,
    `/theia/api/v1/initiateTransaction?mid=${encodeURIComponent(creds.mid)}&orderId=${encodeURIComponent(input.orderId)}`,
    {
      requestType: "Payment",
      mid: creds.mid,
      websiteName: creds.website,
      orderId: input.orderId,
      callbackUrl: `${host}/theia/paytmCallback?ORDER_ID=${input.orderId}`,
      txnAmount: { value: input.amount.toFixed(2), currency: "INR" },
      userInfo: { custId: input.customerId },
    }
  );
  const info = res.body?.resultInfo;
  if (info?.resultStatus !== "S" || !res.body?.txnToken) {
    logger.error("paytm: initiate refused", { code: info?.resultCode, message: info?.resultMsg });
    if (info?.resultCode === "330" || info?.resultCode === "501") {
      throw new HttpError(409, "The Paytm merchant key was rejected. Check it under Settings → Billing.");
    }
    throw new HttpError(409, UNAVAILABLE);
  }
  return { txnToken: res.body.txnToken };
}

export interface PaytmStatus {
  /** TXN_SUCCESS, TXN_FAILURE, PENDING or NO_RECORD_FOUND. */
  resultStatus: string;
  resultCode?: string;
  resultMsg?: string;
  orderId?: string;
  txnId?: string;
  /** In rupees, as text ("158.00"). */
  txnAmount?: string;
  paymentMode?: string;
}

/** What Paytm itself says about an order: the only thing a payment is trusted on. */
export async function fetchPaytmStatus(creds: PaytmCredentials, orderId: string): Promise<PaytmStatus> {
  const res = await call<Omit<PaytmStatus, "resultStatus" | "resultCode" | "resultMsg">>(creds, "/v3/order/status", {
    mid: creds.mid,
    orderId,
  });
  const info = res.body?.resultInfo ?? {};
  return {
    resultStatus: info.resultStatus ?? "",
    resultCode: info.resultCode,
    resultMsg: info.resultMsg,
    orderId: res.body?.orderId,
    txnId: res.body?.txnId,
    txnAmount: res.body?.txnAmount,
    paymentMode: res.body?.paymentMode,
  };
}

/** Asks about an order that does not exist: Paytm answers "no record" when the keys are right, and refuses a bad signature. */
export async function checkPaytmKeys(creds: PaytmCredentials): Promise<void> {
  const status = await fetchPaytmStatus(creds, `KEYCHECK${Date.now()}`);
  if (status.resultCode === "330" || status.resultCode === "325" || /checksum|signature/i.test(status.resultMsg ?? "")) {
    throw new HttpError(409, "Paytm rejected the Merchant ID or Merchant Key. Check them under Settings → Billing.");
  }
}

/** Rupees as Paytm writes them ("158.00") to paise, or NaN. */
export function paytmAmountToPaise(value: unknown): number {
  const rupees = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(rupees) ? Math.round(rupees * 100) : NaN;
}

/** A unique order id Paytm accepts (letters and digits, up to 50). */
export function newPaytmOrderId(): string {
  return `PTM${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}
