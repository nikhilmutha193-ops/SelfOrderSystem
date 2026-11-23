import { HydratedDocument } from "mongoose";

import { RequestContext } from "../../core/context";
import { IAdmin } from "../../models/Admin";
import { IPaymentAttempt, PaymentAttemptStatus } from "../../models/PaymentAttempt";
import { writeAudit } from "../../utils/audit";
import { HttpError } from "../../utils/httpError";
import { describeError, logger } from "../../utils/logger";
import { openSecret, sealSecret } from "../../utils/secretBox";
import { settleOrder } from "../orders/orders.billing";
import { getOrder, getOwnedOrder } from "../orders/orders.service";
import { credentialsOf, paytmCredentialsOf } from "./gateway";
import {
  checkPaytmKeys,
  fetchPaytmStatus,
  initiatePaytmTransaction,
  newPaytmOrderId,
  paytmAmountToPaise,
  paytmHost,
  PaytmCredentials,
} from "./paytm";
import { PaymentsRepository } from "./payments.repository";
import { ConfirmCheckoutInput, ConfirmPaytmInput, GatewaySettingsInput } from "./payments.schema";
import {
  captureRazorpayPayment,
  checkoutSignatureMatches,
  checkRazorpayKeys,
  createRazorpayOrder,
  fetchRazorpayPayment,
  RazorpayCredentials,
  RazorpayPayment,
  webhookSignatureMatches,
} from "./razorpay";

type AttemptDoc = HydratedDocument<IPaymentAttempt>;

const NOT_SET_UP = "Online payment isn't set up. Please pay at the counter.";
// A checkout the guest closed can be reopened for a while instead of creating another gateway order.
const REUSE_CHECKOUT_MS = 30 * 60 * 1000;

const providerName = (provider: "razorpay" | "paytm") => (provider === "paytm" ? "Paytm" : "Razorpay");

/** Settlements made by the gateway are recorded as received by "Razorpay" or "Paytm", not by a staff login. */
function gatewayContext(restaurantId: string, provider: "razorpay" | "paytm" = "razorpay"): RequestContext {
  return {
    restaurantId,
    auth: { role: "admin", restaurantId, id: restaurantId },
    admin: { username: providerName(provider) } as IAdmin,
  };
}

function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export async function getGatewaySettings(ctx: RequestContext) {
  const gateway = await new PaymentsRepository(ctx.restaurantId).findGateway();
  return {
    provider: gateway?.provider ?? ("razorpay" as const),
    enabled: !!gateway?.enabled,
    keyId: gateway?.keyId ?? "",
    hasKeySecret: !!gateway?.keySecretEnc,
    hasWebhookSecret: !!gateway?.webhookSecretEnc,
    paytm: {
      mid: gateway?.paytmMid ?? "",
      website: gateway?.paytmWebsite || "DEFAULT",
      environment: gateway?.paytmEnvironment ?? ("production" as const),
      hasKey: !!gateway?.paytmKeyEnc,
    },
    // Saved but unreadable, e.g. after JWT_SECRET changed: the owner has to enter them again.
    secretsUnreadable:
      (!!gateway?.keySecretEnc && openSecret(gateway.keySecretEnc) === null) ||
      (!!gateway?.webhookSecretEnc && openSecret(gateway.webhookSecretEnc) === null) ||
      (!!gateway?.paytmKeyEnc && openSecret(gateway.paytmKeyEnc) === null),
  };
}

export async function updateGatewaySettings(ctx: RequestContext, input: GatewaySettingsInput) {
  const repo = new PaymentsRepository(ctx.restaurantId);
  const current = await repo.findGateway();
  const provider = input.provider ?? current?.provider ?? "razorpay";
  const enabled = input.enabled ?? current?.enabled ?? false;

  // Razorpay
  const keyId = input.keyId ?? current?.keyId ?? "";
  const keySecret = input.keySecret || (current ? openSecret(current.keySecretEnc) : null) || "";
  const keysChanged = (input.keyId !== undefined && input.keyId !== current?.keyId) || !!input.keySecret;

  // Paytm
  const paytmMid = input.paytmMid ?? current?.paytmMid ?? "";
  const paytmKey = input.paytmKey || (current?.paytmKeyEnc ? openSecret(current.paytmKeyEnc) : null) || "";
  const paytmWebsite = input.paytmWebsite || current?.paytmWebsite || "DEFAULT";
  const paytmEnvironment = input.paytmEnvironment ?? current?.paytmEnvironment ?? "production";
  const paytmChanged =
    (input.paytmMid !== undefined && input.paytmMid !== current?.paytmMid) ||
    !!input.paytmKey ||
    (input.paytmEnvironment !== undefined && input.paytmEnvironment !== current?.paytmEnvironment) ||
    (input.paytmWebsite !== undefined && input.paytmWebsite !== current?.paytmWebsite);

  if (enabled && provider === "razorpay" && (!keyId || !keySecret)) {
    throw new HttpError(400, "Enter the Razorpay key ID and key secret to turn on online payment");
  }
  if (enabled && provider === "paytm" && (!paytmMid || !paytmKey)) {
    throw new HttpError(400, "Enter the Paytm Merchant ID and Merchant Key to turn on online payment");
  }
  const switchedOn = enabled && (!current?.enabled || provider !== current?.provider);
  if (provider === "razorpay" && keyId && keySecret && (keysChanged || switchedOn)) {
    await checkRazorpayKeys({ keyId, keySecret });
  }
  if (provider === "paytm" && paytmMid && paytmKey && (paytmChanged || switchedOn)) {
    await checkPaytmKeys({ mid: paytmMid, merchantKey: paytmKey, website: paytmWebsite, environment: paytmEnvironment });
  }

  await repo.saveGateway({
    enabled,
    provider,
    keyId,
    ...(input.keySecret && { keySecretEnc: sealSecret(input.keySecret) }),
    ...(input.webhookSecret && { webhookSecretEnc: sealSecret(input.webhookSecret) }),
    paytmMid,
    paytmWebsite,
    paytmEnvironment,
    ...(input.paytmKey && { paytmKeyEnc: sealSecret(input.paytmKey) }),
  });
  const account = provider === "paytm" ? `Paytm ${paytmMid} (${paytmEnvironment})` : `Razorpay${keyId ? ` ${keyId}` : ""}`;
  await writeAudit(
    ctx,
    "payments.settings",
    `${enabled ? "Turned on" : "Turned off"} online payment (${account})${
      keysChanged || input.paytmKey ? ", keys updated" : ""
    }${input.webhookSecret ? ", webhook secret updated" : ""}`
  );
  return getGatewaySettings(ctx);
}

async function requireCredentials(repo: PaymentsRepository, { enabled }: { enabled: boolean }) {
  const gateway = await repo.findGateway();
  const creds = credentialsOf(gateway);
  if (!creds || gateway?.provider === "paytm" || (enabled && !gateway?.enabled)) throw new HttpError(409, NOT_SET_UP);
  return creds;
}

async function requirePaytm(repo: PaymentsRepository, { enabled }: { enabled: boolean }) {
  const gateway = await repo.findGateway();
  const creds = paytmCredentialsOf(gateway);
  if (!creds || gateway?.provider !== "paytm" || (enabled && !gateway?.enabled)) throw new HttpError(409, NOT_SET_UP);
  return creds;
}

/** What the order owes right now, after the checks every online payment needs. */
async function checkoutTarget(ctx: RequestContext, orderId: string, repo: PaymentsRepository) {
  const order = await getOwnedOrder(ctx, orderId);
  if (order.status === "closed") throw new HttpError(409, "This order is already paid");
  if (order.status !== "open" && order.status !== "billed") throw new HttpError(409, "This order can't be paid");
  if (ctx.auth.role === "table") {
    const restaurant = await repo.findGuestPayOptions();
    if (restaurant?.billingSettings?.guestPayOptions?.online === false) {
      throw new HttpError(403, "Online payment isn't available for guests. Please pay at the counter.");
    }
  }
  return order;
}

/** Opens (or reopens) an online checkout for what the order owes right now, with whichever gateway is chosen. */
export async function startCheckout(ctx: RequestContext, orderId: string) {
  const repo = new PaymentsRepository(ctx.restaurantId);
  const order = await checkoutTarget(ctx, orderId, repo);
  const gateway = await repo.findGateway();
  const paytm = gateway?.provider === "paytm";
  const creds = paytm ? await requirePaytm(repo, { enabled: true }) : await requireCredentials(repo, { enabled: true });

  const { totals, items } = await getOrder(ctx, orderId);
  if (!items.some((i) => i.status !== "cancelled")) throw new HttpError(409, "Add something to the order first");
  const amount = toPaise(totals.grandTotal);
  if (amount < 100) throw new HttpError(409, "There is nothing to pay online");

  const restaurant = await repo.findRestaurantName();
  const common = {
    name: restaurant?.name ?? "",
    description: order.invoiceNumber ? `Bill ${order.invoiceNumber}` : "Your order",
  };

  if (paytm) {
    const paytmCreds = creds as PaytmCredentials;
    // Paytm's token belongs to one transaction and is short-lived, so every checkout is a new Paytm order.
    const gatewayOrderId = newPaytmOrderId();
    const { txnToken } = await initiatePaytmTransaction(paytmCreds, {
      orderId: gatewayOrderId,
      amount: amount / 100,
      customerId: order.customerPhone ? order.customerPhone.replace(/\D/g, "") || order._id.toString() : order._id.toString(),
    });
    await repo.createAttempt({ orderId: order._id, amount, gatewayOrderId, provider: "paytm" });
    return {
      provider: "paytm" as const,
      mid: paytmCreds.mid,
      host: paytmHost(paytmCreds.environment),
      gatewayOrderId,
      txnToken,
      amount,
      currency: "INR" as const,
      ...common,
      prefill: { name: order.customerName || "", contact: order.customerPhone || "" },
    };
  }

  const razorpay = creds as RazorpayCredentials;
  const attempt =
    (await repo.findReusableAttempt(order._id, amount, new Date(Date.now() - REUSE_CHECKOUT_MS))) ??
    (await repo.createAttempt({
      orderId: order._id,
      amount,
      gatewayOrderId: (
        await createRazorpayOrder(razorpay, {
          amount,
          receipt: order._id.toString(),
          notes: { orderId: order._id.toString(), restaurantId: ctx.restaurantId },
        })
      ).id,
    }));

  return {
    provider: "razorpay" as const,
    keyId: razorpay.keyId,
    gatewayOrderId: attempt.gatewayOrderId,
    amount,
    currency: "INR" as const,
    ...common,
    prefill: { name: order.customerName || "", contact: order.customerPhone || "" },
  };
}

/** The browser's word that Checkout succeeded: trusted only once the signature and Razorpay agree. */
export async function confirmCheckout(ctx: RequestContext, input: ConfirmCheckoutInput) {
  const repo = new PaymentsRepository(ctx.restaurantId);
  const attempt = await repo.findAttempt(input.razorpay_order_id);
  if (!attempt) throw new HttpError(404, "Payment not found");
  await getOwnedOrder(ctx, attempt.orderId.toString());

  const creds = await requireCredentials(repo, { enabled: false });
  if (!checkoutSignatureMatches(creds.keySecret, input.razorpay_order_id, input.razorpay_payment_id, input.razorpay_signature)) {
    throw new HttpError(400, "We couldn't confirm this payment. If money was taken, show the payment at the counter.");
  }
  return completePayment(ctx.restaurantId, attempt, input.razorpay_payment_id, () =>
    razorpayVerified(creds, attempt, input.razorpay_payment_id)
  );
}

interface WebhookBody {
  event?: string;
  payload?: { payment?: { entity?: { id?: string; order_id?: string } } };
}

/** Razorpay's server-to-server notice, for guests who closed the page before the confirmation reached us. */
export async function handleWebhook(restaurantId: string, rawBody: Buffer | undefined, signature: unknown, body: WebhookBody) {
  const repo = new PaymentsRepository(restaurantId);
  const gateway = await repo.findGateway();
  const webhookSecret = gateway ? openSecret(gateway.webhookSecretEnc) : null;
  if (!webhookSecret || !rawBody) throw new HttpError(400, "The webhook secret isn't set");
  if (!webhookSignatureMatches(webhookSecret, rawBody, signature)) throw new HttpError(400, "Invalid signature");

  const payment = body.payload?.payment?.entity;
  const handled = ["payment.captured", "payment.authorized", "order.paid"];
  if (!handled.includes(body.event ?? "") || !payment?.id || !payment.order_id) return { status: "ignored" };

  const attempt = await repo.findAttempt(payment.order_id);
  const creds = credentialsOf(gateway);
  if (!attempt || !creds) return { status: "ignored" };
  return completePayment(restaurantId, attempt, payment.id, () => razorpayVerified(creds, attempt, payment.id!));
}

/** The browser's word that Paytm Checkout finished: Paytm itself is asked, and only its answer is believed. */
export async function confirmPaytm(ctx: RequestContext, input: ConfirmPaytmInput) {
  const repo = new PaymentsRepository(ctx.restaurantId);
  const attempt = await repo.findAttempt(input.orderId);
  if (!attempt || attempt.provider !== "paytm") throw new HttpError(404, "Payment not found");
  await getOwnedOrder(ctx, attempt.orderId.toString());
  const creds = await requirePaytm(repo, { enabled: false });
  return completePayment(ctx.restaurantId, attempt, attempt.gatewayOrderId, () => paytmVerified(creds, attempt));
}

/**
 * Paytm's server-to-server notice (Paytm dashboard > Developer Settings > Webhook), for guests who closed the page.
 * The notice itself is never trusted: it only says which order to ask Paytm about.
 */
export async function handlePaytmWebhook(restaurantId: string, body: Record<string, unknown>) {
  const nested = (body.body ?? {}) as Record<string, unknown>;
  const raw = body.ORDERID ?? body.orderId ?? nested.orderId ?? nested.ORDERID;
  const orderId = typeof raw === "string" ? raw.trim() : "";
  if (!orderId) return { status: "ignored" };

  const repo = new PaymentsRepository(restaurantId);
  const attempt = await repo.findAttempt(orderId);
  const creds = paytmCredentialsOf(await repo.findGateway());
  if (!attempt || attempt.provider !== "paytm" || !creds) return { status: "ignored" };
  try {
    return await completePayment(restaurantId, attempt, attempt.gatewayOrderId, () => paytmVerified(creds, attempt));
  } catch (err) {
    // A payment that is not (yet) successful is not an error for Paytm's notice.
    if (err instanceof HttpError && err.status < 500) return { status: "ignored" };
    throw err;
  }
}

/** The payment as Razorpay reports it, captured if it was only authorized. Throws unless it fully went through. */
async function capturedPayment(
  creds: RazorpayCredentials,
  attempt: AttemptDoc,
  paymentId: string
): Promise<RazorpayPayment> {
  let payment = await fetchRazorpayPayment(creds, paymentId);
  if (payment.order_id !== attempt.gatewayOrderId || payment.amount !== attempt.amount || payment.currency !== "INR") {
    throw new HttpError(400, "This payment doesn't match the order");
  }
  if (payment.status === "authorized") payment = await captureRazorpayPayment(creds, paymentId, attempt.amount);
  if (payment.status !== "captured") throw new HttpError(409, "The payment hasn't gone through yet");
  return payment;
}

type Verified = { id: string; method?: string };

async function razorpayVerified(creds: RazorpayCredentials, attempt: AttemptDoc, paymentId: string): Promise<Verified> {
  const payment = await capturedPayment(creds, attempt, paymentId);
  return { id: payment.id, method: payment.method };
}

/** Paytm's own status for the order: it must be a success, for exactly the amount asked, on this order. */
async function paytmVerified(creds: PaytmCredentials, attempt: AttemptDoc): Promise<Verified> {
  const status = await fetchPaytmStatus(creds, attempt.gatewayOrderId);
  if (status.resultStatus === "PENDING") throw new HttpError(409, "The payment hasn't gone through yet");
  if (status.resultStatus !== "TXN_SUCCESS") {
    throw new HttpError(409, status.resultMsg ? `The payment didn't go through: ${status.resultMsg}` : "The payment didn't go through");
  }
  if (status.orderId !== attempt.gatewayOrderId || paytmAmountToPaise(status.txnAmount) !== attempt.amount || !status.txnId) {
    throw new HttpError(400, "This payment doesn't match the order");
  }
  return { id: status.txnId, method: status.paymentMode };
}

/**
 * Settles the order with a confirmed gateway payment, once. The checkout is claimed first, so the
 * browser confirmation and the webhook can arrive together and only one of them settles.
 * `verify` asks the gateway (and throws unless the payment fully went through).
 */
async function completePayment(
  restaurantId: string,
  attempt: AttemptDoc,
  claimId: string,
  verify: () => Promise<Verified>
): Promise<{ status: PaymentAttemptStatus }> {
  const repo = new PaymentsRepository(restaurantId);
  if (attempt.status !== "created") return { status: attempt.status };
  const claimed = await repo.claimAttempt(attempt._id, claimId);
  if (!claimed) return { status: (await repo.findAttemptById(attempt._id))?.status ?? "processing" };

  const payment = await verify().catch(async (err: unknown) => {
    await repo.releaseAttempt(attempt._id);
    throw err;
  });

  const gateway = providerName(attempt.provider);
  const ctx = gatewayContext(restaurantId, attempt.provider);
  const rupees = attempt.amount / 100;
  const { order, totals } = await getOrder(ctx, attempt.orderId.toString());
  const flag = async (status: PaymentAttemptStatus, note: string) => {
    await repo.finishAttempt(attempt._id, status, { method: payment.method, note, paymentId: payment.id });
    await writeAudit(ctx, "payments.attention", `Online payment ${payment.id} of ₹${rupees.toFixed(2)}: ${note}`);
    return { status };
  };

  if (order.status === "closed" || order.status === "cancelled") {
    return flag(
      "duplicate",
      `the order was already ${order.status === "closed" ? "paid" : "cancelled"}. Refund it from the ${gateway} dashboard.`
    );
  }
  if (toPaise(totals.grandTotal) !== attempt.amount) {
    return flag("mismatch", `the bill is now ₹${totals.grandTotal.toFixed(2)}. Settle the order by hand.`);
  }
  try {
    await settleOrder(ctx, order._id.toString(), {
      payments: [{ method: "online", amount: rupees, reference: payment.id }],
    });
  } catch (err) {
    logger.error("payments: settling after online payment failed", { paymentId: payment.id, ...describeError(err) });
    const reason = err instanceof HttpError && err.status < 500 ? err.message.replace(/\.$/, "") : "it could not be settled";
    return flag("mismatch", `${reason}. Settle the order by hand.`);
  }
  await repo.finishAttempt(attempt._id, "paid", { method: payment.method, paymentId: payment.id });
  return { status: "paid" };
}

/** Online payments that were taken but couldn't settle their order by themselves (last 30 days). */
export async function listAttention(ctx: RequestContext) {
  return new PaymentsRepository(ctx.restaurantId).findNeedingAttention(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
}
