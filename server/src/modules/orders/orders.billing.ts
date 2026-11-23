import { ClientSession, HydratedDocument } from "mongoose";

import { RequestContext } from "../../core/context";
import { emit } from "../../core/events";
import { withTransaction } from "../../core/transaction";
import { IBillSnapshot, IOrder, IPayment, PaymentMethod } from "../../models/Order";
import { IOrderItem } from "../../models/OrderItem";
import { IRestaurant } from "../../models/Restaurant";
import { writeAudit } from "../../utils/audit";
import { computeDiscountAmount, findValidCoupon } from "../../utils/coupon";
import { assertDayOpen } from "../../utils/dayLock";
import { paidBeforeKitchen } from "../../utils/dineInPayment";
import { HttpError } from "../../utils/httpError";
import { computeInvoiceTotals, InvoiceItem, InvoiceTotals, PricingInput, round2 } from "../../utils/invoice";
import { DEFAULT_SAC, financialYearLabel, nextInvoiceNumber } from "../../utils/invoiceNumber";
import { normalizePhone } from "../../utils/phone";
import { syncTableState } from "../../utils/tableState";
import { getOwnedOrder, requireOwner } from "./orders.access";
import { assertCreditAllowed, assertCreditCustomer } from "../credit/credit.service";
import { OrdersRepository } from "./orders.repository";
import { GenerateBillInput, SettleInput } from "./orders.schema";

type OrderDoc = HydratedDocument<IOrder>;
type PricingRestaurant = Pick<IRestaurant, "taxRates" | "billingSettings"> | null | undefined;

const CHANGED_ELSEWHERE = "This order was just updated by someone else. Refresh and try again.";

/** The extra charges that apply to an order: automatic ones for its type (unless removed) and ones staff added. */
export function extraChargesFor(
  order: Pick<IOrder, "orderType" | "extraChargeKeys" | "extraChargesOff">,
  restaurant: PricingRestaurant
) {
  const added = new Set(order.extraChargeKeys ?? []);
  const removed = new Set(order.extraChargesOff ?? []);
  return (restaurant?.billingSettings?.extraCharges ?? []).filter(
    (c) =>
      c.active &&
      (added.has(c.key) || (c.autoApply && c.orderTypes.includes(order.orderType) && !removed.has(c.key)))
  );
}

export function pricingFor(
  order: Pick<
    IOrder,
    | "orderType"
    | "discountAmount"
    | "manualDiscount"
    | "serviceChargeWaived"
    | "packagingWaived"
    | "loyaltyRedeem"
    | "extraChargeKeys"
    | "extraChargesOff"
  >,
  restaurant: PricingRestaurant,
  items?: InvoiceItem[]
): PricingInput {
  const billing = restaurant?.billingSettings;
  // Flat packaging: one amount per order when it is takeaway/delivery or a dish was marked Pack.
  const flat =
    billing?.packagingMode === "flat" && items
      ? order.orderType !== "dine-in" || items.some((i) => i.status !== "cancelled" && i.isPacked)
        ? (billing.packagingFlatCharge ?? 0)
        : 0
      : undefined;
  return {
    packagingWaived: !!order.packagingWaived,
    extraCharges: extraChargesFor(order, restaurant).map(({ name, type, value }) => ({ name, type, value })),
    ...(flat !== undefined && { flatPackaging: flat }),
    couponDiscount: order.discountAmount,
    manualDiscount: order.manualDiscount,
    loyaltyDiscount: order.loyaltyRedeem?.amount ?? 0,
    serviceChargePercent: order.serviceChargeWaived ? 0 : (restaurant?.billingSettings?.serviceChargePercent ?? 0),
  };
}

export function totalsForOrder(
  order: Pick<
    IOrder,
    | "bill"
    | "orderType"
    | "discountAmount"
    | "manualDiscount"
    | "serviceChargeWaived"
    | "packagingWaived"
    | "loyaltyRedeem"
    | "extraChargeKeys"
    | "extraChargesOff"
  >,
  items: InvoiceItem[],
  restaurant: PricingRestaurant
): InvoiceTotals {
  if (order.bill) {
    const bill = order.bill;
    return {
      subtotal: bill.subtotal,
      couponDiscount: bill.couponDiscount ?? bill.discount,
      manualDiscount: bill.manualDiscount ?? 0,
      loyaltyDiscount: bill.loyaltyDiscount ?? 0,
      discount: bill.discount,
      serviceChargePercent: bill.serviceChargePercent ?? 0,
      serviceCharge: bill.serviceCharge ?? 0,
      packagingCharge: bill.packagingCharge ?? 0,
      extraCharges: (bill.extraCharges ?? []).map(({ name, amount }) => ({ name, amount })),
      taxableAmount: bill.taxableAmount,
      taxLines: bill.taxLines.map(({ name, percent, base, amount }) => ({ name, percent, base, amount })),
      roundOff: bill.roundOff,
      grandTotal: bill.grandTotal,
    };
  }
  return computeInvoiceTotals(items, restaurant?.taxRates ?? [], pricingFor(order, restaurant, items));
}

export function snapshotFromTotals(
  totals: InvoiceTotals,
  restaurant: Pick<IRestaurant, "invoiceSettings">,
  couponCode: string | undefined,
  legacy: boolean
): IBillSnapshot {
  return {
    subtotal: totals.subtotal,
    couponDiscount: totals.couponDiscount,
    manualDiscount: totals.manualDiscount,
    loyaltyDiscount: totals.loyaltyDiscount,
    discount: totals.discount,
    serviceChargePercent: totals.serviceChargePercent,
    serviceCharge: totals.serviceCharge,
    packagingCharge: totals.packagingCharge,
    extraCharges: totals.extraCharges,
    couponCode,
    taxableAmount: totals.taxableAmount,
    taxLines: totals.taxLines,
    roundOff: totals.roundOff,
    grandTotal: totals.grandTotal,
    sac: DEFAULT_SAC,
    placeOfSupply: restaurant.invoiceSettings?.placeOfSupply ?? "",
    legacy,
  };
}

function activeSubtotal(items: Pick<IOrderItem, "status" | "total">[]): number {
  return items.filter((i) => i.status !== "cancelled").reduce((sum, i) => sum + i.total, 0);
}

export async function refreshCouponDiscount(repo: OrdersRepository, order: OrderDoc): Promise<void> {
  if (order.status !== "open" || !order.couponCode) return;
  const items = await repo.findItems(order._id);
  const subtotal = activeSubtotal(items);
  const coupon = await repo.findCoupon(order.couponCode);
  const expired = !!coupon?.expiresAt && coupon.expiresAt.getTime() < Date.now();
  if (!coupon || !coupon.isActive || expired || subtotal < coupon.minOrderValue) {
    order.couponCode = undefined;
    order.discountAmount = 0;
  } else {
    order.discountAmount = computeDiscountAmount(coupon, subtotal);
  }
  await repo.saveOrder(order);
}

async function transition(
  repo: OrdersRepository,
  order: OrderDoc,
  from: IOrder["status"],
  changes: Partial<IOrder>,
  session?: ClientSession
): Promise<void> {
  if (!(await repo.transitionOrder(order._id, from, changes, session))) {
    throw new HttpError(409, CHANGED_ELSEWHERE);
  }
}

async function syncOrderTable(order: Pick<IOrder, "orderType" | "tableId"> & Partial<Pick<IOrder, "payAtCounter">>): Promise<void> {
  // A bill left for the counter no longer belongs to the table's seating, which may be someone else's by now.
  if (order.payAtCounter) return;
  if (order.orderType === "dine-in" && order.tableId) await syncTableState(order.tableId);
}

async function billOpenOrder(ctx: RequestContext, repo: OrdersRepository, order: OrderDoc, input: GenerateBillInput) {
  if (order.status !== "open") throw new HttpError(409, "Only an open order can be billed");

  const items = await repo.findItems(order._id);
  if (!items.some((i) => i.status !== "cancelled")) {
    throw new HttpError(409, "Add at least one item before generating the bill");
  }
  const restaurant = await repo.findRestaurant();
  if (!restaurant) throw new HttpError(404, "Restaurant not found");
  // Orders paid before cooking (kiosk, cafe flow, or dine-in when guests pay first) send their items once paid.
  const sentOnPayment = paidBeforeKitchen(order, restaurant);
  const unsent = items.filter((i) => i.status === "pending" && i.kotRound == null).length;
  if (unsent > 0 && !sentOnPayment) {
    throw new HttpError(
      409,
      `Send ${unsent} item${unsent === 1 ? "" : "s"} to the kitchen or cancel ${unsent === 1 ? "it" : "them"} before billing`
    );
  }
  const subtotal = activeSubtotal(items);

  let couponDiscount = 0;
  let couponId: IOrder["_id"] | null = null;
  if (order.couponCode) {
    try {
      const coupon = await findValidCoupon(ctx.restaurantId, order.couponCode, subtotal, order.customerPhone);
      couponDiscount = computeDiscountAmount(coupon, subtotal);
      couponId = coupon._id;
    } catch (err) {
      const reason = err instanceof HttpError ? err.message.replace(/\.$/, "") : "it is no longer valid";
      throw new HttpError(409, `Coupon ${order.couponCode} can't be used: ${reason}. Remove it and try again.`);
    }
  }

  const totals = computeInvoiceTotals(items, restaurant.taxRates, {
    ...pricingFor(order, restaurant, items),
    couponDiscount,
  });
  const prefix = restaurant.invoiceSettings?.invoicePrefix || "INV";
  const financialYear = order.financialYear ?? financialYearLabel(new Date(), restaurant.timezone);

  const changes = await withTransaction(async (session) => {
    if (couponId && !(await repo.claimCouponUse(couponId, session))) {
      throw new HttpError(409, `Coupon ${order.couponCode} has reached its usage limit. Remove it and try again.`);
    }
    if (couponId) {
      await repo.recordCouponRedemption(couponId, order._id, normalizePhone(order.customerPhone) ?? "", session);
    }
    const invoiceNumber =
      order.invoiceNumber ?? (await nextInvoiceNumber(ctx.restaurantId, prefix, financialYear, session));
    const next: Partial<IOrder> = {
      status: "billed",
      billedAt: new Date(),
      invoiceNumber,
      financialYear,
      discountAmount: couponDiscount,
      bill: snapshotFromTotals(totals, restaurant, order.couponCode, false),
      ...(input.customerGstin && { customerGstin: input.customerGstin }),
    };
    await transition(repo, order, "open", next, session);
    return next;
  });
  order.set(changes);
  await syncOrderTable(order);

  await writeAudit(ctx, "order.bill", `Generated bill ${order.invoiceNumber} (₹${totals.grandTotal.toFixed(2)})`);
  await emit("order.billed", { restaurantId: ctx.restaurantId, orderId: order._id.toString() });
}

export async function generateBill(ctx: RequestContext, orderId: string, input: GenerateBillInput) {
  const order = await getOwnedOrder(ctx, orderId);
  await billOpenOrder(ctx, new OrdersRepository(ctx.restaurantId), order, input);
  return order;
}

export async function reopenBill(ctx: RequestContext, orderId: string, reason: string) {
  const order = await getOwnedOrder(ctx, orderId);
  if (order.status !== "billed") throw new HttpError(409, "Only a billed, unpaid order can be reopened");
  await assertDayOpen(ctx, order.billedAt, "reopen");

  const repo = new OrdersRepository(ctx.restaurantId);
  const changes: Partial<IOrder> = { status: "open", bill: null, billedAt: null };
  await withTransaction(async (session) => {
    await transition(repo, order, "billed", changes, session);
    if (order.couponCode) {
      await repo.releaseCouponUse(order.couponCode, session);
      await repo.releaseCouponRedemption(order._id, session);
    }
  });
  order.set(changes);
  await syncOrderTable(order);

  await writeAudit(ctx, "order.reopen", `Reopened bill ${order.invoiceNumber}: ${reason}`);
  return order;
}

/** A UPI payment taken at the till needs the payer's mobile number or a screenshot, so it can be checked later. */
const UPI_PROOF_REQUIRED = "For a UPI payment add the payer's mobile number or a screenshot of the payment";

function buildPayments(
  ctx: RequestContext,
  order: Pick<IOrder, "_id" | "customerPhone">,
  input: SettleInput,
  total: number,
  options: { requireUpiProof?: boolean } = {}
): IPayment[] {
  const lines: (Partial<Pick<IPayment, "payerPhone" | "proofKey" | "reference" | "tendered">> & {
    method: IPayment["method"];
    amount: number;
  })[] = input.payments ?? (input.paymentMethod
    ? [{ method: input.paymentMethod, amount: total, payerPhone: input.payerPhone, proofKey: input.proofKey }]
    : []);
  if (lines.length === 0) throw new HttpError(400, "Add at least one payment");

  // Only a bill of nothing (every dish complimentary) is settled with a payment of zero.
  if (total > 0 && lines.some((line) => line.amount <= 0)) {
    throw new HttpError(400, "Payment amounts must be more than zero");
  }

  const sum = round2(lines.reduce((acc, line) => acc + line.amount, 0));
  if (Math.abs(sum - total) > 0.001) {
    throw new HttpError(400, `Payments add up to ₹${sum.toFixed(2)} but the bill is ₹${total.toFixed(2)}`);
  }

  const orderId = order._id.toString();
  // The number the guest already gave for this order stands in when none is typed for the UPI payment.
  const guestPhone = normalizePhone(order.customerPhone);
  const now = new Date();
  return lines.map((line) => {
    if (line.method === "cash" && line.tendered !== undefined && line.tendered < line.amount) {
      throw new HttpError(400, "Cash received is less than the cash amount");
    }
    let payerPhone: string | undefined;
    if (line.method === "upi") {
      if (line.payerPhone) {
        const normalized = normalizePhone(line.payerPhone);
        if (!normalized) throw new HttpError(400, "Enter a valid mobile number for the UPI payment");
        payerPhone = normalized;
      }
      if (line.proofKey && !line.proofKey.startsWith(`${orderId}-`)) {
        throw new HttpError(400, "That payment screenshot belongs to another order");
      }
      if (!payerPhone && !line.proofKey && guestPhone) payerPhone = guestPhone;
      if (options.requireUpiProof && !payerPhone && !line.proofKey) throw new HttpError(400, UPI_PROOF_REQUIRED);
    }
    return {
      method: line.method,
      amount: round2(line.amount),
      ...(line.reference && { reference: line.reference }),
      ...(payerPhone && { payerPhone }),
      ...(line.method === "upi" && line.proofKey && { proofKey: line.proofKey }),
      ...(line.method === "cash" &&
        line.tendered !== undefined && { tendered: line.tendered, change: round2(line.tendered - line.amount) }),
      receivedBy: ctx.auth.id,
      receivedByName: ctx.admin?.username,
      at: now,
    };
  });
}

function summarizeMethod(payments: IPayment[]): PaymentMethod {
  const methods = new Set(payments.map((p) => p.method));
  return methods.size === 1 ? payments[0].method : "split";
}

/**
 * Settles a bill. `requireUpiProof` is set for payments staff take by hand (the Settle screen); payments that
 * come from somewhere else (the online gateway, offline sales synced later) have their own record.
 */
export async function settleOrder(
  ctx: RequestContext,
  orderId: string,
  input: SettleInput,
  options: { requireUpiProof?: boolean } = {}
) {
  const order = await getOwnedOrder(ctx, orderId);
  const repo = new OrdersRepository(ctx.restaurantId);
  const wantsCredit = input.paymentMethod === "credit" || (input.payments ?? []).some((p) => p.method === "credit");
  if (wantsCredit) assertCreditCustomer(order);
  if (order.status === "open") await billOpenOrder(ctx, repo, order, {});
  if (order.status !== "billed" || !order.bill) throw new HttpError(409, "This order is not open");

  const payments = buildPayments(ctx, order, input, order.bill.grandTotal, options);
  const onAccount = payments.filter((p) => p.method === "credit").reduce((sum, p) => sum + p.amount, 0);
  if (onAccount > 0) await assertCreditAllowed(ctx.restaurantId, order, onAccount);
  const changes: Partial<IOrder> = {
    status: "closed",
    payments,
    paymentMethod: summarizeMethod(payments),
    checkoutTime: new Date(),
  };
  await transition(repo, order, "billed", changes);
  order.set(changes);
  // Dishes already waiting at the pass are handed over with the payment.
  await repo.serveReadyItems(order._id);
  await syncOrderTable(order);

  const breakdown = payments.map((p) => `${p.method} ₹${p.amount.toFixed(2)}`).join(" + ");
  await writeAudit(
    ctx,
    "order.pay",
    `Settled bill ${order.invoiceNumber} for ${order.customerName || "guest"} (${breakdown})`
  );
  await emit("order.settled", { restaurantId: ctx.restaurantId, orderId: order._id.toString() });
  return order;
}

export async function cancelOrder(ctx: RequestContext, orderId: string, reason: string | undefined) {
  const order = await getOwnedOrder(ctx, orderId);
  if (order.status === "closed") throw new HttpError(409, "This bill is already paid. Void it instead.");
  if (order.status === "cancelled") throw new HttpError(409, "This order is already cancelled");
  if (order.status === "billed" && !reason) throw new HttpError(400, "A reason is required to cancel a bill");
  if (order.status === "billed") await assertDayOpen(ctx, order.billedAt, "cancel");

  const repo = new OrdersRepository(ctx.restaurantId);
  const from = order.status;
  const changes: Partial<IOrder> = {
    status: "cancelled",
    cancelledAt: new Date(),
    ...(reason && { cancelReason: reason }),
  };
  await withTransaction(async (session) => {
    await transition(repo, order, from, changes, session);
    if (from === "billed" && order.couponCode) {
      await repo.releaseCouponUse(order.couponCode, session);
      await repo.releaseCouponRedemption(order._id, session);
    }
  });
  order.set(changes);
  await repo.cancelPendingItems(order._id);
  await syncOrderTable(order);

  const label = from === "billed" ? `bill ${order.invoiceNumber}` : `order for ${order.customerName || "guest"}`;
  await writeAudit(ctx, "order.cancel", `Cancelled ${label}${reason ? `: ${reason}` : ""}`);
  await emit("order.cancelled", { restaurantId: ctx.restaurantId, orderId: order._id.toString(), voided: false });
  return order;
}

export async function voidBill(ctx: RequestContext, orderId: string, reason: string) {
  await requireOwner(ctx, "void a paid bill");
  const order = await getOwnedOrder(ctx, orderId);
  if (order.status !== "closed") throw new HttpError(409, "Only a paid bill can be voided");

  const repo = new OrdersRepository(ctx.restaurantId);
  const changes: Partial<IOrder> = { status: "cancelled", voidedAt: new Date(), voidReason: reason };
  await withTransaction(async (session) => {
    await transition(repo, order, "closed", changes, session);
    if (order.couponCode) {
      await repo.releaseCouponUse(order.couponCode, session);
      await repo.releaseCouponRedemption(order._id, session);
    }
  });
  order.set(changes);

  await writeAudit(ctx, "order.void", `Voided bill ${order.invoiceNumber}: ${reason}`);
  await emit("order.cancelled", { restaurantId: ctx.restaurantId, orderId: order._id.toString(), voided: true });
  return order;
}
