import { ClientSession, HydratedDocument } from "mongoose";

import { RequestContext } from "../../core/context";
import { emit } from "../../core/events";
import { withTransaction } from "../../core/transaction";
import { IBillSnapshot, IOrder } from "../../models/Order";
import { IOrderItem } from "../../models/OrderItem";
import { IRestaurant, ITaxRate } from "../../models/Restaurant";
import { writeAudit } from "../../utils/audit";
import { computeDiscountAmount, findValidCoupon } from "../../utils/coupon";
import { HttpError } from "../../utils/httpError";
import { computeInvoiceTotals, InvoiceTotals } from "../../utils/invoice";
import { DEFAULT_SAC, financialYearLabel, nextInvoiceNumber } from "../../utils/invoiceNumber";
import { getOwnedOrder, requireOwner } from "./orders.access";
import { OrdersRepository } from "./orders.repository";
import { GenerateBillInput, PayOrderInput } from "./orders.schema";

type OrderDoc = HydratedDocument<IOrder>;

const CHANGED_ELSEWHERE = "This order was just updated by someone else. Refresh and try again.";

export function totalsForOrder(
  order: Pick<IOrder, "bill" | "discountAmount">,
  items: Pick<IOrderItem, "status" | "total">[],
  taxRates: ITaxRate[]
): InvoiceTotals {
  if (order.bill) {
    const { subtotal, discount, taxableAmount, taxLines, roundOff, grandTotal } = order.bill;
    return {
      subtotal,
      discount,
      taxableAmount,
      taxLines: taxLines.map(({ name, percent, base, amount }) => ({ name, percent, base, amount })),
      roundOff,
      grandTotal,
    };
  }
  return computeInvoiceTotals(items, taxRates, order.discountAmount);
}

export function snapshotFromTotals(
  totals: InvoiceTotals,
  restaurant: Pick<IRestaurant, "invoiceSettings">,
  couponCode: string | undefined,
  legacy: boolean
): IBillSnapshot {
  return {
    subtotal: totals.subtotal,
    discount: totals.discount,
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

async function billOpenOrder(ctx: RequestContext, repo: OrdersRepository, order: OrderDoc, input: GenerateBillInput) {
  if (order.status !== "open") throw new HttpError(409, "Only an open order can be billed");

  const items = await repo.findItems(order._id);
  if (!items.some((i) => i.status !== "cancelled")) {
    throw new HttpError(409, "Add at least one item before generating the bill");
  }
  const subtotal = activeSubtotal(items);

  const restaurant = await repo.findRestaurant();
  if (!restaurant) throw new HttpError(404, "Restaurant not found");

  let discount = 0;
  let couponId: IOrder["_id"] | null = null;
  if (order.couponCode) {
    try {
      const coupon = await findValidCoupon(ctx.restaurantId, order.couponCode, subtotal);
      discount = computeDiscountAmount(coupon, subtotal);
      couponId = coupon._id;
    } catch (err) {
      const reason = err instanceof HttpError ? err.message.replace(/\.$/, "") : "it is no longer valid";
      throw new HttpError(409, `Coupon ${order.couponCode} can't be used: ${reason}. Remove it and try again.`);
    }
  }

  const totals = computeInvoiceTotals(items, restaurant.taxRates, discount);
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
      discountAmount: discount,
      bill: snapshotFromTotals(totals, restaurant, order.couponCode, false),
      ...(input.customerGstin && { customerGstin: input.customerGstin }),
    };
    await transition(repo, order, "open", next, session);
    return next;
  });
  order.set(changes);

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

  const repo = new OrdersRepository(ctx.restaurantId);
  const changes: Partial<IOrder> = { status: "open", bill: null, billedAt: null };
  await withTransaction(async (session) => {
    await transition(repo, order, "billed", changes, session);
    if (order.couponCode) await repo.releaseCouponUse(order.couponCode, session);
  });
  order.set(changes);

  await writeAudit(ctx, "order.reopen", `Reopened bill ${order.invoiceNumber}: ${reason}`);
  return order;
}

export async function settleOrder(ctx: RequestContext, orderId: string, input: PayOrderInput) {
  const order = await getOwnedOrder(ctx, orderId);
  const repo = new OrdersRepository(ctx.restaurantId);
  if (order.status === "open") await billOpenOrder(ctx, repo, order, {});
  if (order.status !== "billed") throw new HttpError(409, "This order is not open");

  const changes: Partial<IOrder> = { status: "closed", paymentMethod: input.paymentMethod, checkoutTime: new Date() };
  await transition(repo, order, "billed", changes);
  order.set(changes);

  if (order.orderType === "dine-in" && order.tableId) await repo.releaseTable(order.tableId);

  await writeAudit(
    ctx,
    "order.pay",
    `Settled bill ${order.invoiceNumber} for ${order.customerName || "guest"} (${input.paymentMethod})`
  );
  await emit("order.settled", { restaurantId: ctx.restaurantId, orderId: order._id.toString() });
  return order;
}

export async function cancelOrder(ctx: RequestContext, orderId: string, reason: string | undefined) {
  const order = await getOwnedOrder(ctx, orderId);
  if (order.status === "closed") throw new HttpError(409, "This bill is already paid. Void it instead.");
  if (order.status === "cancelled") throw new HttpError(409, "This order is already cancelled");
  if (order.status === "billed" && !reason) throw new HttpError(400, "A reason is required to cancel a bill");

  const repo = new OrdersRepository(ctx.restaurantId);
  const from = order.status;
  const changes: Partial<IOrder> = { status: "cancelled", ...(reason && { cancelReason: reason }) };
  await withTransaction(async (session) => {
    await transition(repo, order, from, changes, session);
    if (from === "billed" && order.couponCode) await repo.releaseCouponUse(order.couponCode, session);
  });
  order.set(changes);
  await repo.cancelPendingItems(order._id);

  if (order.orderType === "dine-in" && order.tableId) await repo.releaseTable(order.tableId);

  const label = from === "billed" ? `bill ${order.invoiceNumber}` : `order for ${order.customerName || "guest"}`;
  await writeAudit(ctx, "order.cancel", `Cancelled ${label}${reason ? `: ${reason}` : ""}`);
  await emit("order.cancelled", { restaurantId: ctx.restaurantId, orderId: order._id.toString() });
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
  await emit("order.cancelled", { restaurantId: ctx.restaurantId, orderId: order._id.toString() });
  return order;
}
