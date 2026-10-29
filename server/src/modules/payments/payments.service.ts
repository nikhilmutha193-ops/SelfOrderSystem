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
import { credentialsOf } from "./gateway";
import { PaymentsRepository } from "./payments.repository";
import { ConfirmCheckoutInput, GatewaySettingsInput } from "./payments.schema";
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

/** Settlements made by the gateway are recorded as received by "Razorpay", not by a staff login. */
function gatewayContext(restaurantId: string): RequestContext {
  return {
    restaurantId,
    auth: { role: "admin", restaurantId, id: restaurantId },
    admin: { username: "Razorpay" } as IAdmin,
  };
}

function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export async function getGatewaySettings(ctx: RequestContext) {
  const gateway = await new PaymentsRepository(ctx.restaurantId).findGateway();
  return {
    provider: "razorpay" as const,
    enabled: !!gateway?.enabled,
    keyId: gateway?.keyId ?? "",
    hasKeySecret: !!gateway?.keySecretEnc,
    hasWebhookSecret: !!gateway?.webhookSecretEnc,
    // Saved but unreadable, e.g. after JWT_SECRET changed: the owner has to enter them again.
    secretsUnreadable:
      (!!gateway?.keySecretEnc && openSecret(gateway.keySecretEnc) === null) ||
      (!!gateway?.webhookSecretEnc && openSecret(gateway.webhookSecretEnc) === null),
  };
}

export async function updateGatewaySettings(ctx: RequestContext, input: GatewaySettingsInput) {
  const repo = new PaymentsRepository(ctx.restaurantId);
  const current = await repo.findGateway();
  const keyId = input.keyId ?? current?.keyId ?? "";
  const keySecret = input.keySecret || (current ? openSecret(current.keySecretEnc) : null) || "";
  const enabled = input.enabled ?? current?.enabled ?? false;

  if (enabled && (!keyId || !keySecret)) {
    throw new HttpError(400, "Enter the Razorpay key ID and key secret to turn on online payment");
  }
  const keysChanged = (input.keyId !== undefined && input.keyId !== current?.keyId) || !!input.keySecret;
  if (keyId && keySecret && (keysChanged || (enabled && !current?.enabled))) {
    await checkRazorpayKeys({ keyId, keySecret });
  }

  await repo.saveGateway({
    enabled,
    keyId,
    ...(input.keySecret && { keySecretEnc: sealSecret(input.keySecret) }),
    ...(input.webhookSecret && { webhookSecretEnc: sealSecret(input.webhookSecret) }),
  });
  await writeAudit(
    ctx,
    "payments.settings",
    `${enabled ? "Turned on" : "Turned off"} online payment (Razorpay${keyId ? ` ${keyId}` : ""})${
      keysChanged ? ", keys updated" : ""
    }${input.webhookSecret ? ", webhook secret updated" : ""}`
  );
  return getGatewaySettings(ctx);
}

async function requireCredentials(repo: PaymentsRepository, { enabled }: { enabled: boolean }) {
  const gateway = await repo.findGateway();
  const creds = credentialsOf(gateway);
  if (!creds || (enabled && !gateway?.enabled)) throw new HttpError(409, NOT_SET_UP);
  return creds;
}

/** Opens (or reopens) a Razorpay checkout for what the order owes right now. */
export async function startCheckout(ctx: RequestContext, orderId: string) {
  const order = await getOwnedOrder(ctx, orderId);
  if (order.status === "closed") throw new HttpError(409, "This order is already paid");
  if (order.status !== "open" && order.status !== "billed") throw new HttpError(409, "This order can't be paid");

  const repo = new PaymentsRepository(ctx.restaurantId);
  const creds = await requireCredentials(repo, { enabled: true });
  const { totals, items } = await getOrder(ctx, orderId);
  if (!items.some((i) => i.status !== "cancelled")) throw new HttpError(409, "Add something to the order first");
  const amount = toPaise(totals.grandTotal);
  if (amount < 100) throw new HttpError(409, "There is nothing to pay online");

  const attempt =
    (await repo.findReusableAttempt(order._id, amount, new Date(Date.now() - REUSE_CHECKOUT_MS))) ??
    (await repo.createAttempt({
      orderId: order._id,
      amount,
      gatewayOrderId: (
        await createRazorpayOrder(creds, {
          amount,
          receipt: order._id.toString(),
          notes: { orderId: order._id.toString(), restaurantId: ctx.restaurantId },
        })
      ).id,
    }));

  const restaurant = await repo.findRestaurantName();
  return {
    provider: "razorpay" as const,
    keyId: creds.keyId,
    gatewayOrderId: attempt.gatewayOrderId,
    amount,
    currency: "INR" as const,
    name: restaurant?.name ?? "",
    description: order.invoiceNumber ? `Bill ${order.invoiceNumber}` : "Your order",
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
  return completePayment(ctx.restaurantId, creds, attempt, input.razorpay_payment_id);
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
  return completePayment(restaurantId, creds, attempt, payment.id);
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

/**
 * Settles the order with a confirmed gateway payment, once. The checkout is claimed first, so the
 * browser confirmation and the webhook can arrive together and only one of them settles.
 */
async function completePayment(
  restaurantId: string,
  creds: RazorpayCredentials,
  attempt: AttemptDoc,
  paymentId: string
): Promise<{ status: PaymentAttemptStatus }> {
  const repo = new PaymentsRepository(restaurantId);
  if (attempt.status !== "created") return { status: attempt.status };
  const claimed = await repo.claimAttempt(attempt._id, paymentId);
  if (!claimed) return { status: (await repo.findAttemptById(attempt._id))?.status ?? "processing" };

  const payment = await capturedPayment(creds, attempt, paymentId).catch(async (err: unknown) => {
    await repo.releaseAttempt(attempt._id);
    throw err;
  });

  const ctx = gatewayContext(restaurantId);
  const rupees = attempt.amount / 100;
  const { order, totals } = await getOrder(ctx, attempt.orderId.toString());
  const flag = async (status: PaymentAttemptStatus, note: string) => {
    await repo.finishAttempt(attempt._id, status, { method: payment.method, note });
    await writeAudit(ctx, "payments.attention", `Online payment ${paymentId} of ₹${rupees.toFixed(2)}: ${note}`);
    return { status };
  };

  if (order.status === "closed" || order.status === "cancelled") {
    return flag("duplicate", `the order was already ${order.status === "closed" ? "paid" : "cancelled"}. Refund it from the Razorpay dashboard.`);
  }
  if (toPaise(totals.grandTotal) !== attempt.amount) {
    return flag("mismatch", `the bill is now ₹${totals.grandTotal.toFixed(2)}. Settle the order by hand.`);
  }
  try {
    await settleOrder(ctx, order._id.toString(), {
      payments: [{ method: "online", amount: rupees, reference: paymentId }],
    });
  } catch (err) {
    logger.error("payments: settling after online payment failed", { paymentId, ...describeError(err) });
    const reason = err instanceof HttpError && err.status < 500 ? err.message.replace(/\.$/, "") : "it could not be settled";
    return flag("mismatch", `${reason}. Settle the order by hand.`);
  }
  await repo.finishAttempt(attempt._id, "paid", { method: payment.method });
  return { status: "paid" };
}

/** Online payments that were taken but couldn't settle their order by themselves (last 30 days). */
export async function listAttention(ctx: RequestContext) {
  return new PaymentsRepository(ctx.restaurantId).findNeedingAttention(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
}
