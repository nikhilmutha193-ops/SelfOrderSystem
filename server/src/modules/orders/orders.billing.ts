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
import { HttpError } from "../../utils/httpError";
import { computeInvoiceTotals, InvoiceItem, InvoiceTotals, PricingInput, round2 } from "../../utils/invoice";
import { DEFAULT_SAC, financialYearLabel, nextInvoiceNumber } from "../../utils/invoiceNumber";
import { syncTableState } from "../../utils/tableState";
import { getOwnedOrder, requireOwner } from "./orders.access";
import { assertCreditAllowed, assertCreditCustomer } from "../credit/credit.service";
import { OrdersRepository } from "./orders.repository";
import { GenerateBillInput, SettleInput } from "./orders.schema";

type OrderDoc = HydratedDocument<IOrder>;
type PricingRestaurant = Pick<IRestaurant, "taxRates" | "billingSettings"> | null | undefined;

const CHANGED_ELSEWHERE = "This order was just updated by someone else. Refresh and try again.";

export function pricingFor(
  order: Pick<IOrder, "discountAmount" | "manualDiscount" | "serviceChargeWaived" | "loyaltyRedeem">,
  restaurant: PricingRestaurant
): PricingInput {
  return {
    couponDiscount: order.discountAmount,
    manualDiscount: order.manualDiscount,
    loyaltyDiscount: order.loyaltyRedeem?.amount ?? 0,
    serviceChargePercent: order.serviceChargeWaived ? 0 : (restaurant?.billingSettings?.serviceChargePercent ?? 0),
  };
}

export function totalsForOrder(
  order: Pick<IOrder, "bill" | "discountAmount" | "manualDiscount" | "serviceChargeWaived" | "loyaltyRedeem">,
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
      taxableAmount: bill.taxableAmount,
      taxLines: bill.taxLines.map(({ name, percent, base, amount }) => ({ name, percent, base, amount })),
      roundOff: bill.roundOff,
      grandTotal: bill.grandTotal,
    };
  }
  return computeInvoiceTotals(items, restaurant?.taxRates ?? [], pricingFor(order, restaurant));
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

async function syncOrderTable(order: Pick<IOrder, "orderType" | "tableId">): Promise<void> {
  if (order.orderType === "dine-in" && order.tableId) await syncTableState(order.tableId);
}

async function billOpenOrder(ctx: RequestContext, repo: OrdersRepository, order: OrderDoc, input: GenerateBillInput) {
  if (order.status !== "open") throw new HttpError(409, "Only an open order can be billed");

  const items = await repo.findItems(order._id);
  if (!items.some((i) => i.status !== "cancelled")) {
    throw new HttpError(409, "Add at least one item before generating the bill");
  }
  const unsent = items.filter((i) => i.status === "pending" && i.kotRound == null).length;
  if (unsent > 0) {
    throw new HttpError(
      409,
      `Send ${unsent} item${unsent === 1 ? "" : "s"} to the kitchen or cancel ${unsent === 1 ? "it" : "them"} before billing`
    );
  }
  const subtotal = activeSubtotal(items);

  const restaurant = await repo.findRestaurant();
  if (!restaurant) throw new HttpError(404, "Restaurant not found");

  let couponDiscount = 0;
  let couponId: IOrder["_id"] | null = null;
  if (order.couponCode) {
    try {
      const coupon = await findValidCoupon(ctx.restaurantId, order.couponCode, subtotal);
      couponDiscount = computeDiscountAmount(coupon, subtotal);
      couponId = coupon._id;
    } catch (err) {
      const reason = err instanceof HttpError ? err.message.replace(/\.$/, "") : "it is no longer valid";
      throw new HttpError(409, `Coupon ${order.couponCode} can't be used: ${reason}. Remove it and try again.`);
    }
  }

  const totals = computeInvoiceTotals(items, restaurant.taxRates, {
    ...pricingFor(order, restaurant),
    couponDiscount,
  });
  const prefix = restaurant.invoiceSettings?.invoicePrefix || "INV";
  const financialYear = order.financialYear ?? financialYearLabel(new Date(), restaurant.timezone);

  const changes = await withTransaction(async (session) => {
    if (couponId && !(await repo.claimCouponUse(couponId, session))) {
      throw new HttpError(409, `Coupon ${order.couponCode} has reached its usage limit. Remove it and try again.`);
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
    if (order.couponCode) await repo.releaseCouponUse(order.couponCode, session);
  });
  order.set(changes);
  await syncOrderTable(order);

  await writeAudit(ctx, "order.reopen", `Reopened bill ${order.invoiceNumber}: ${reason}`);
  return order;
}

function buildPayments(ctx: RequestContext, input: SettleInput, total: number): IPayment[] {
  const lines = input.payments ?? (input.paymentMethod ? [{ method: input.paymentMethod, amount: total }] : []);
  if (lines.length === 0) throw new HttpError(400, "Add at least one payment");

  const sum = round2(lines.reduce((acc, line) => acc + line.amount, 0));
  if (Math.abs(sum - total) > 0.001) {
    throw new HttpError(400, `Payments add up to ₹${sum.toFixed(2)} but the bill is ₹${total.toFixed(2)}`);
  }

  const now = new Date();
  return lines.map((line) => {
    if (line.method === "cash" && line.tendered !== undefined && line.tendered < line.amount) {
      throw new HttpError(400, "Cash received is less than the cash amount");
    }
    return {
      method: line.method,
      amount: round2(line.amount),
      ...(line.reference && { reference: line.reference }),
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

export async function settleOrder(ctx: RequestContext, orderId: string, input: SettleInput) {
  const order = await getOwnedOrder(ctx, orderId);
  const repo = new OrdersRepository(ctx.restaurantId);
  const wantsCredit = input.paymentMethod === "credit" || (input.payments ?? []).some((p) => p.method === "credit");
  if (wantsCredit) assertCreditCustomer(order);
  if (order.status === "open") await billOpenOrder(ctx, repo, order, {});
  if (order.status !== "billed" || !order.bill) throw new HttpError(409, "This order is not open");

  const payments = buildPayments(ctx, input, order.bill.grandTotal);
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
    if (from === "billed" && order.couponCode) await repo.releaseCouponUse(order.couponCode, session);
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
    if (order.couponCode) await repo.releaseCouponUse(order.couponCode, session);
  });
  order.set(changes);

  await writeAudit(ctx, "order.void", `Voided bill ${order.invoiceNumber}: ${reason}`);
  await emit("order.cancelled", { restaurantId: ctx.restaurantId, orderId: order._id.toString(), voided: true });
  return order;
}
