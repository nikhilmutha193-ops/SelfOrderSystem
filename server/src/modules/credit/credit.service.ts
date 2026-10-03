import { Types } from "mongoose";

import { RequestContext } from "../../core/context";
import { withTransaction } from "../../core/transaction";
import { IOrder } from "../../models/Order";
import { writeAudit } from "../../utils/audit";
import { HttpError } from "../../utils/httpError";
import { logger } from "../../utils/logger";
import { addCashMovement } from "../shifts/shifts.service";
import { CreditRepository } from "./credit.repository";
import { CreditPaymentInput } from "./credit.schema";

const round2 = (n: number) => Math.round(n * 100) / 100;

function creditPart(order: Pick<IOrder, "payments">) {
  return round2((order.payments ?? []).filter((p) => p.method === "credit").reduce((sum, p) => sum + p.amount, 0));
}

export function assertCreditCustomer(order: Pick<IOrder, "customerId">) {
  if (!order.customerId) {
    throw new HttpError(400, "Attach the guest's phone number before putting the bill on their account");
  }
}

export async function assertCreditAllowed(restaurantId: string, order: Pick<IOrder, "customerId">, amount: number) {
  assertCreditCustomer(order);
  const repo = new CreditRepository(restaurantId);
  const customer = await repo.findCustomer(order.customerId!);
  if (!customer) throw new HttpError(404, "This guest no longer exists");
  if (customer.creditLimit != null) {
    const balance = await repo.balance(customer._id);
    if (round2(balance + amount) > customer.creditLimit) {
      const room = Math.max(0, round2(customer.creditLimit - balance));
      throw new HttpError(
        409,
        `That's over ${customer.name || "this guest"}'s credit limit. They can put up to ₹${room.toFixed(2)} more on their account.`
      );
    }
  }
}

export async function creditBalance(restaurantId: string, customerId: Types.ObjectId) {
  return round2(await new CreditRepository(restaurantId).balance(customerId));
}

export async function onOrderSettled(restaurantId: string, orderId: string) {
  const repo = new CreditRepository(restaurantId);
  const order = await repo.findOrder(orderId);
  if (!order || !order.customerId) return;
  const amount = creditPart(order);
  if (amount <= 0) return;
  try {
    await repo.addEntry({
      customerId: order.customerId,
      type: "charge",
      amount,
      orderId: order._id,
      invoiceNumber: order.invoiceNumber,
      note: `Bill ${order.invoiceNumber ?? ""}`.trim(),
    });
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
  }
}

export async function onOrderVoided(restaurantId: string, orderId: string) {
  const repo = new CreditRepository(restaurantId);
  const entries = await repo.entriesForOrder(new Types.ObjectId(orderId));
  const charge = entries.find((e) => e.type === "charge");
  if (!charge || entries.some((e) => e.type === "reverse")) return;
  try {
    await repo.addEntry({
      customerId: charge.customerId,
      type: "reverse",
      amount: charge.amount,
      orderId: charge.orderId,
      invoiceNumber: charge.invoiceNumber,
      note: `Bill ${charge.invoiceNumber ?? ""} voided`.trim(),
    });
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
  }
}

export async function customerCredit(ctx: RequestContext, customerId: string) {
  const repo = new CreditRepository(ctx.restaurantId);
  const customer = await repo.findCustomer(customerId);
  if (!customer) throw new HttpError(404, "Customer not found");
  const [balance, entries] = await Promise.all([repo.balance(customer._id), repo.entries(customer._id, 100)]);
  return { balance: round2(balance), creditLimit: customer.creditLimit ?? null, entries };
}

export async function setCreditLimit(ctx: RequestContext, customerId: string, creditLimit: number | null) {
  const repo = new CreditRepository(ctx.restaurantId);
  const customer = await repo.setLimit(customerId, creditLimit);
  if (!customer) throw new HttpError(404, "Customer not found");
  await writeAudit(
    ctx,
    "credit.limit",
    `Set ${customer.name || customer.phone}'s credit limit to ${creditLimit == null ? "no limit" : `₹${creditLimit.toFixed(2)}`}`
  );
  return { creditLimit: customer.creditLimit ?? null };
}

export async function recordPayment(ctx: RequestContext, customerId: string, input: CreditPaymentInput) {
  const repo = new CreditRepository(ctx.restaurantId);
  const customer = await repo.findCustomer(customerId);
  if (!customer) throw new HttpError(404, "Customer not found");
  const amount = round2(input.amount);

  const entry = await withTransaction(async (session) => {
    await repo.touch(customer._id, session);
    const due = round2(await repo.balance(customer._id, session));
    if (due <= 0) throw new HttpError(409, `${customer.name || "This guest"} has nothing due`);
    if (amount > due) throw new HttpError(400, `That's more than the ₹${due.toFixed(2)} due`);
    return repo.addEntry(
      {
        customerId: customer._id,
        type: "payment",
        amount,
        method: input.method,
        reference: input.reference || undefined,
        note: input.note || undefined,
        by: new Types.ObjectId(ctx.auth.id),
        byName: ctx.admin?.username,
      },
      session
    );
  });

  const who = customer.name || customer.phone;
  if (input.method === "cash") {
    try {
      await addCashMovement(ctx, { type: "in", amount, reason: `Dues from ${who}`.slice(0, 120) });
    } catch (err) {
      if (!(err instanceof HttpError && err.status === 409)) logger.warn("dues cash not added to shift", { err: String(err) });
    }
  }
  await writeAudit(ctx, "credit.payment", `Received ₹${amount.toFixed(2)} (${input.method}) towards ${who}'s dues`);
  return { entry, balance: await creditBalance(ctx.restaurantId, customer._id) };
}

export async function listDues(ctx: RequestContext) {
  const repo = new CreditRepository(ctx.restaurantId);
  const rows = (await repo.dues())
    .map((r) => ({ ...r, balance: round2(r.charged - r.paid) }))
    .filter((r) => r.balance > 0.004);
  const customers = await repo.customersByIds(rows.map((r) => r._id));
  const byId = new Map(customers.map((c) => [c._id.toString(), c]));
  return rows
    .map((r) => {
      const c = byId.get(r._id.toString());
      return {
        customerId: r._id,
        name: c?.name ?? "",
        phone: c?.phone ?? "",
        creditLimit: c?.creditLimit ?? null,
        balance: r.balance,
        lastAt: r.lastAt,
      };
    })
    .sort((a, b) => b.balance - a.balance);
}
