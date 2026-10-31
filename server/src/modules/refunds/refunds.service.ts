import { RequestContext } from "../../core/context";
import { emit } from "../../core/events";
import { withTransaction } from "../../core/transaction";
import { IRefund } from "../../models/Refund";
import { writeAudit } from "../../utils/audit";
import { getBusinessDayRangeForDate } from "../../utils/businessDay";
import { HttpError } from "../../utils/httpError";
import { round2 } from "../../utils/invoice";
import { getOwnedOrder } from "../orders/orders.service";
import { RefundsRepository } from "./refunds.repository";
import { CreateRefundInput, RefundListInput } from "./refunds.schema";

const CHANGED_ELSEWHERE = "This order was changed by someone else. Check it and try again.";

/** The money that can still go back: what was paid by cash, UPI, card... (not pay-later) less earlier refunds. */
function paidAmount(order: { payments: { method: string; amount: number }[] }) {
  return round2(order.payments.filter((p) => p.method !== "credit").reduce((sum, p) => sum + p.amount, 0));
}

function refundableAmount(order: { payments: { method: string; amount: number }[]; refundedTotal?: number }) {
  return round2(Math.max(0, paidAmount(order) - (order.refundedTotal ?? 0)));
}

/**
 * What one unit of an item gives back: its price plus its share of the bill's tax, service charge and discounts.
 * The bill is the saved snapshot, so this never depends on today's tax rates.
 */
function shareOfBill(
  bill: { subtotal: number; grandTotal: number },
  itemTotal: number,
  quantity: number,
  ordered: number
) {
  if (bill.subtotal <= 0 || ordered <= 0) return 0;
  return round2(((itemTotal * quantity) / ordered) * (bill.grandTotal / bill.subtotal));
}

/** What the refund dialog needs: how much can go back and what each item still allows. */
export async function refundSummary(ctx: RequestContext, orderId: string) {
  const order = await getOwnedOrder(ctx, orderId);
  const repo = new RefundsRepository(ctx.restaurantId);
  const [items, refunds] = await Promise.all([repo.itemsOf(order._id), repo.forOrder(order._id)]);
  const paid = order.status === "closed" && !order.voidedAt;
  return {
    orderId: order._id,
    invoiceNumber: order.invoiceNumber ?? null,
    canRefund: paid,
    paid: round2(order.payments.filter((p) => p.method !== "credit").reduce((s, p) => s + p.amount, 0)),
    refunded: round2(order.refundedTotal ?? 0),
    refundable: paid ? refundableAmount(order) : 0,
    items: items
      .filter((i) => i.status !== "cancelled" || (i.refundedQty ?? 0) > 0)
      .map((i) => {
        const left = Math.max(0, i.quantity - (i.refundedQty ?? 0));
        return {
          _id: i._id,
          foodName: i.foodName,
          quantity: i.quantity,
          refundedQty: i.refundedQty ?? 0,
          refundableQty: i.status === "cancelled" && !(i.refundedQty ?? 0) ? 0 : left,
          unitRefund: order.bill ? shareOfBill(order.bill, i.total, 1, i.quantity) : 0,
        };
      }),
    refunds,
  };
}

export async function createRefund(ctx: RequestContext, input: CreateRefundInput) {
  const order = await getOwnedOrder(ctx, input.orderId);
  if (order.status !== "closed" || !order.bill) throw new HttpError(409, "Only a paid bill can be refunded");
  if (order.voidedAt) throw new HttpError(409, "This bill was voided, so there is nothing to refund");

  const repo = new RefundsRepository(ctx.restaurantId);
  const refundable = refundableAmount(order);
  if (refundable <= 0) throw new HttpError(409, "Everything paid on this bill has already been refunded");

  const items = await repo.itemsOf(order._id);
  const byId = new Map(items.map((i) => [i._id.toString(), i]));
  const lines: IRefund["items"] = [];
  const fullyRefunded: typeof items = [];
  const unitsRefunded: { item: (typeof items)[number]; quantity: number }[] = [];

  for (const line of input.items ?? []) {
    const item = byId.get(line.itemId);
    if (!item) throw new HttpError(404, "One of those items is not on this order");
    const left = item.quantity - (item.refundedQty ?? 0);
    const quantity = line.quantity ?? left;
    if (item.status === "cancelled" && !(item.refundedQty ?? 0)) {
      throw new HttpError(409, `${item.foodName} was cancelled, so it was never charged`);
    }
    if (left <= 0) throw new HttpError(409, `${item.foodName} has already been refunded`);
    if (quantity > left) throw new HttpError(400, `Only ${left} of ${item.foodName} can still be refunded`);
    lines.push({
      itemId: item._id,
      foodName: item.foodName,
      quantity,
      amount: shareOfBill(order.bill, item.total, quantity, item.quantity),
    });
    unitsRefunded.push({ item, quantity });
    if (quantity === left) fullyRefunded.push(item);
  }

  const worked = round2(lines.reduce((sum, l) => sum + l.amount, 0));
  const amount = input.amount !== undefined ? round2(input.amount) : Math.min(worked, refundable);
  if (amount <= 0)
    throw new HttpError(
      400,
      "There is no money to refund for those items. Enter an amount if you want to refund something."
    );
  if (amount > refundable) {
    throw new HttpError(400, `At most ₹${refundable.toFixed(2)} can still be refunded on this bill`);
  }

  const who = ctx.admin?.username ?? "staff";
  const refund = await withTransaction(async (session) => {
    if (!(await repo.claimRefundAmount(order._id, amount, paidAmount(order), session)))
      throw new HttpError(409, CHANGED_ELSEWHERE);
    for (const { item, quantity } of unitsRefunded) {
      if (!(await repo.claimItemUnits(item._id, quantity, item.quantity, session))) {
        throw new HttpError(409, CHANGED_ELSEWHERE);
      }
    }
    // An item refunded in full leaves the kitchen's list, and stock is put back or written off as for any cancelled item.
    for (const item of fullyRefunded) await repo.cancelItem(item._id, session);
    return repo.create(
      {
        restaurantId: order.restaurantId,
        orderId: order._id,
        invoiceNumber: order.invoiceNumber,
        customerName: order.customerName,
        amount,
        method: input.method,
        reason: input.reason,
        note: input.note,
        kind: lines.length > 0 ? "items" : "amount",
        items: lines,
        createdBy: ctx.auth.id,
        createdByName: who,
      },
      session
    );
  });

  for (const item of fullyRefunded) {
    await emit("order.itemCancelled", {
      restaurantId: ctx.restaurantId,
      orderId: order._id.toString(),
      itemId: item._id.toString(),
      previousStatus: item.status,
    });
  }
  await writeAudit(
    ctx,
    "order.refund",
    `Refunded ₹${amount.toFixed(2)} on ${order.invoiceNumber ?? "a bill"} by ${input.method} (${input.reason.replace(/_/g, " ")})`
  );
  return refund;
}

export async function listRefunds(ctx: RequestContext, query: RefundListInput) {
  const repo = new RefundsRepository(ctx.restaurantId);
  const restaurant = await repo.restaurant();
  const range: Record<string, Date> = {};
  if (query.from)
    range.$gte = getBusinessDayRangeForDate(query.from, restaurant?.dayEndTime, restaurant?.timezone).start;
  if (query.to) range.$lt = getBusinessDayRangeForDate(query.to, restaurant?.dayEndTime, restaurant?.timezone).end;
  const refunds = await repo.list(Object.keys(range).length ? { createdAt: range } : {});

  const byMethod: Record<string, number> = {};
  for (const r of refunds) byMethod[r.method] = round2((byMethod[r.method] ?? 0) + r.amount);
  return {
    refunds,
    total: round2(refunds.reduce((sum, r) => sum + r.amount, 0)),
    count: refunds.length,
    byMethod,
  };
}
