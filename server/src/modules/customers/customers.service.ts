import jwt from "jsonwebtoken";
import { FilterQuery, Types } from "mongoose";

import { RequestContext } from "../../core/context";
import { withTransaction } from "../../core/transaction";
import { ICustomer } from "../../models/Customer";
import { ILoyaltyEntry } from "../../models/LoyaltyEntry";
import { ILoyaltySettings } from "../../models/Restaurant";
import { writeAudit } from "../../utils/audit";
import { HttpError } from "../../utils/httpError";
import { computeInvoiceTotals, round2 } from "../../utils/invoice";
import { normalizePhone } from "../../utils/phone";
import { pricingFor, totalsForOrder } from "../orders/orders.billing";
import { CustomersRepository } from "./customers.repository";
import { LoyaltySettingsInput, UpdateCustomerInput } from "./customers.schema";
import { loyaltyBalance } from "./loyalty";

const GENERIC_NAMES = new Set(["", "walk-in", "guest", "counter"]);
const DEFAULT_LOYALTY: ILoyaltySettings = {
  enabled: false,
  pointsPer100: 5,
  pointValue: 1,
  minRedeem: 50,
  expiryDays: 365,
};
const BILL_LINK_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function cleanName(name: string | undefined) {
  const trimmed = (name ?? "").trim();
  return GENERIC_NAMES.has(trimmed.toLowerCase()) ? "" : trimmed;
}

async function loyaltySettings(repo: CustomersRepository): Promise<ILoyaltySettings> {
  const restaurant = await repo.findRestaurant("loyaltySettings");
  const saved = restaurant?.loyaltySettings;
  return saved ? { ...DEFAULT_LOYALTY, ...JSON.parse(JSON.stringify(saved)) } : DEFAULT_LOYALTY;
}

function summary(
  customer: ICustomer,
  entries: Pick<ILoyaltyEntry, "type" | "points" | "expiresAt" | "createdAt">[],
  settings: ILoyaltySettings
) {
  const { balance, expiringSoon } = loyaltyBalance(entries);
  return {
    _id: customer._id,
    phone: customer.phone,
    name: customer.name,
    birthday: customer.birthday ?? "",
    anniversary: customer.anniversary ?? "",
    visitCount: customer.visitCount,
    totalSpend: customer.totalSpend,
    firstVisitAt: customer.firstVisitAt ?? null,
    lastVisitAt: customer.lastVisitAt ?? null,
    tags: customer.tags ?? [],
    marketingConsent: customer.marketingConsent,
    points: balance,
    pointsValue: round2(balance * settings.pointValue),
    expiringSoon,
  };
}

export async function linkOrder(restaurantId: string, orderId: string) {
  const repo = new CustomersRepository(restaurantId);
  const order = await repo.findOrder(orderId);
  if (!order || order.customerId) return;
  const phone = normalizePhone(order.customerPhone);
  if (!phone) return;
  const name = cleanName(order.customerName);
  const customer = await repo.upsertByPhone(phone, name);
  if (!customer.name && name) {
    customer.name = name;
    await customer.save();
  }
  await repo.setOrderCustomer(order._id, customer._id);
}

export async function onSettled(restaurantId: string, orderId: string) {
  await linkOrder(restaurantId, orderId);
  const repo = new CustomersRepository(restaurantId);
  const order = await repo.findOrder(orderId);
  if (!order?.customerId) return;
  const existing = await repo.entriesForOrder(order._id);
  if (existing.some((e) => e.type === "earn")) return;

  const total = order.bill?.grandTotal ?? 0;
  await repo.recordVisit(order.customerId, total, order.checkoutTime ?? new Date());
  const settings = await loyaltySettings(repo);
  if (!settings.enabled || settings.pointsPer100 <= 0) return;
  const points = Math.floor((total * settings.pointsPer100) / 100);
  if (points <= 0) return;
  await repo.addEntry({
    customerId: order.customerId,
    type: "earn",
    points,
    orderId: order._id,
    expiresAt: settings.expiryDays > 0 ? new Date(Date.now() + settings.expiryDays * DAY_MS) : null,
    note: `Bill ${order.invoiceNumber ?? ""}`.trim(),
  });
}

export async function onCancelled(restaurantId: string, orderId: string, voided: boolean) {
  const repo = new CustomersRepository(restaurantId);
  const order = await repo.findOrder(orderId);
  if (!order?.customerId) return;
  const entries = await repo.entriesForOrder(order._id);
  const redeemed = entries
    .filter((e) => e.type === "redeem" || (e.type === "reverse" && e.points > 0))
    .reduce((s, e) => s + e.points, 0);
  if (redeemed < 0) {
    await repo.addEntry({
      customerId: order.customerId,
      type: "reverse",
      points: -redeemed,
      orderId: order._id,
      note: "Points returned: order cancelled",
    });
  }
  if (!voided) return;
  const earned = entries
    .filter((e) => e.type === "earn" || (e.type === "reverse" && e.points < 0))
    .reduce((s, e) => s + e.points, 0);
  if (earned > 0) {
    await repo.addEntry({
      customerId: order.customerId,
      type: "reverse",
      points: -earned,
      orderId: order._id,
      note: "Points taken back: bill voided",
    });
  }
  if (entries.some((e) => e.type === "earn") || order.bill)
    await repo.undoVisit(order.customerId, order.bill?.grandTotal ?? 0);
}

async function openOrderWithCustomer(ctx: RequestContext, repo: CustomersRepository, orderId: string) {
  let order = await repo.findOrder(orderId);
  if (!order) throw new HttpError(404, "Order not found");
  if (order.status !== "open")
    throw new HttpError(409, "Points can only be used on an open order. Reopen the bill first.");
  if (!order.customerId) {
    await linkOrder(ctx.restaurantId, orderId);
    order = await repo.findOrder(orderId);
  }
  if (!order?.customerId) throw new HttpError(409, "Add the guest's phone number to use points");
  return order;
}

export async function redeemPoints(ctx: RequestContext, orderId: string, points: number) {
  const repo = new CustomersRepository(ctx.restaurantId);
  const settings = await loyaltySettings(repo);
  if (!settings.enabled) throw new HttpError(409, "Loyalty points are turned off");
  const order = await openOrderWithCustomer(ctx, repo, orderId);
  if (points < settings.minRedeem) throw new HttpError(400, `Redeem at least ${settings.minRedeem} points`);

  const restaurant = await repo.findRestaurant("billingSettings taxRates");
  const items = await repo.findItems(order._id);
  const totals = computeInvoiceTotals(items, [], { ...pricingFor(order, restaurant), loyaltyDiscount: 0 });
  const payable = round2(totals.subtotal - totals.discount);
  const amount = round2(points * settings.pointValue);
  if (amount > payable) {
    const most = settings.pointValue > 0 ? Math.floor(payable / settings.pointValue) : 0;
    throw new HttpError(400, `That's more than the bill. Use up to ${most} points.`);
  }

  const customerId = order.customerId!;
  const previous = order.loyaltyRedeem;
  await withTransaction(async (session) => {
    await repo.touch(customerId, session);
    const available = loyaltyBalance(await repo.entries(customerId, session)).balance + (previous?.points ?? 0);
    if (points > available) throw new HttpError(409, `Only ${available} points are available`);
    if (previous) {
      await repo.addEntry(
        {
          customerId,
          type: "reverse",
          points: previous.points,
          orderId: order._id,
          note: "Points returned: redemption changed",
        },
        session
      );
    }
    await repo.addEntry(
      {
        customerId,
        type: "redeem",
        points: -points,
        orderId: order._id,
        note: `Used on order for ${order.customerName}`,
      },
      session
    );
    await repo.setLoyaltyRedeem(order._id, { points, amount }, session);
  });
  await writeAudit(
    ctx,
    "loyalty.redeem",
    `Redeemed ${points} points (₹${amount.toFixed(2)}) for ${order.customerName}`
  );
  return orderCustomer(ctx, orderId);
}

export async function removeRedemption(ctx: RequestContext, orderId: string) {
  const repo = new CustomersRepository(ctx.restaurantId);
  const order = await openOrderWithCustomer(ctx, repo, orderId);
  const previous = order.loyaltyRedeem;
  if (!previous) throw new HttpError(409, "No points are used on this order");
  await withTransaction(async (session) => {
    await repo.touch(order.customerId!, session);
    await repo.addEntry(
      {
        customerId: order.customerId!,
        type: "reverse",
        points: previous.points,
        orderId: order._id,
        note: "Points returned: removed from order",
      },
      session
    );
    await repo.setLoyaltyRedeem(order._id, null, session);
  });
  return orderCustomer(ctx, orderId);
}

export async function lookup(ctx: RequestContext, rawPhone: string) {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new HttpError(400, "Enter a valid phone number");
  const repo = new CustomersRepository(ctx.restaurantId);
  const [customer, settings] = await Promise.all([repo.findByPhone(phone), loyaltySettings(repo)]);
  if (!customer) return { phone, customer: null };
  return { phone, customer: summary(customer, await repo.entries(customer._id), settings) };
}

export async function orderCustomer(ctx: RequestContext, orderId: string) {
  const repo = new CustomersRepository(ctx.restaurantId);
  const order = await repo.findOrder(orderId);
  if (!order) throw new HttpError(404, "Order not found");
  const settings = await loyaltySettings(repo);
  const loyalty = { enabled: settings.enabled, pointValue: settings.pointValue, minRedeem: settings.minRedeem };
  const customer = order.customerId ? await repo.findById(order.customerId) : null;
  return {
    customer: customer ? summary(customer, await repo.entries(customer._id), settings) : null,
    redeem: order.loyaltyRedeem ?? null,
    loyalty,
  };
}

export async function attachToOrder(ctx: RequestContext, orderId: string, rawPhone: string, name: string) {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new HttpError(400, "Enter a valid phone number");
  const repo = new CustomersRepository(ctx.restaurantId);
  const order = await repo.findOrder(orderId);
  if (!order) throw new HttpError(404, "Order not found");
  if (order.status !== "open" && order.status !== "billed") throw new HttpError(409, "This order is closed");
  if (order.loyaltyRedeem && order.customerId) {
    throw new HttpError(409, "Remove the points used on this order before changing the guest");
  }
  const customer = await repo.upsertByPhone(phone, cleanName(name) || cleanName(order.customerName));
  if (!customer.name && cleanName(name)) {
    customer.name = cleanName(name);
    await customer.save();
  }
  await repo.setOrderCustomer(order._id, customer._id, {
    customerPhone: rawPhone.trim(),
    ...(cleanName(order.customerName) === "" && customer.name && { customerName: customer.name }),
  });
  return orderCustomer(ctx, orderId);
}

function upcomingMonthDays(days: number) {
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() + i * DAY_MS);
    out.push(`${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return out;
}

export async function listCustomers(ctx: RequestContext, segment?: string, q?: string) {
  const repo = new CustomersRepository(ctx.restaurantId);
  const filter: FilterQuery<ICustomer> = {};
  if (segment === "regulars") filter.visitCount = { $gte: 3 };
  if (segment === "lapsed") filter.lastVisitAt = { $lt: new Date(Date.now() - 30 * DAY_MS) };
  if (segment === "birthdays") filter.birthday = { $in: upcomingMonthDays(7) };
  if (segment === "consented") filter.marketingConsent = true;
  if (q) {
    const digits = q.replace(/\D/g, "");
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { name: { $regex: escaped, $options: "i" } },
      ...(digits.length >= 3 ? [{ phone: { $regex: digits } }] : []),
    ];
  }
  const [customers, settings] = await Promise.all([repo.list(filter, 200), loyaltySettings(repo)]);
  return Promise.all(customers.map(async (c) => summary(c, await repo.entries(c._id), settings)));
}

export async function customerProfile(ctx: RequestContext, id: string) {
  const repo = new CustomersRepository(ctx.restaurantId);
  const customer = await repo.findById(id);
  if (!customer) throw new HttpError(404, "Customer not found");
  const [entries, orders, settings] = await Promise.all([
    repo.entries(customer._id),
    repo.customerOrders(customer._id, 50),
    loyaltySettings(repo),
  ]);
  return {
    customer: summary(customer, entries, settings),
    orders: orders.map((o) => ({
      _id: o._id,
      orderType: o.orderType,
      status: o.status,
      invoiceNumber: o.invoiceNumber ?? null,
      date: o.checkoutTime ?? o.createdAt,
      total: o.bill?.grandTotal ?? null,
      pointsUsed: o.loyaltyRedeem?.points ?? 0,
    })),
    ledger: [...entries].reverse().slice(0, 50),
  };
}

export async function updateCustomer(ctx: RequestContext, id: string, input: UpdateCustomerInput) {
  const repo = new CustomersRepository(ctx.restaurantId);
  const customer = await repo.findById(id);
  if (!customer) throw new HttpError(404, "Customer not found");
  if (input.marketingConsent && !customer.marketingConsent) customer.consentAt = new Date();
  if (!input.marketingConsent) customer.consentAt = null;
  customer.set({
    name: input.name,
    birthday: input.birthday || undefined,
    anniversary: input.anniversary || undefined,
    tags: [...new Set(input.tags)],
    marketingConsent: input.marketingConsent,
  });
  await customer.save();
  return customerProfile(ctx, id);
}

export async function getLoyaltySettings(ctx: RequestContext) {
  return loyaltySettings(new CustomersRepository(ctx.restaurantId));
}

export async function saveLoyaltySettings(ctx: RequestContext, input: LoyaltySettingsInput) {
  await new CustomersRepository(ctx.restaurantId).updateLoyaltySettings(input);
  await writeAudit(
    ctx,
    "loyalty.settings",
    input.enabled
      ? `Loyalty on: ${input.pointsPer100} points per ₹100, ₹${input.pointValue} per point, min ${input.minRedeem}, expiry ${input.expiryDays} days`
      : "Loyalty turned off"
  );
  return input;
}

function billSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return `${secret}:bill-link`;
}

export async function shareBill(ctx: RequestContext, orderId: string, origin: string | undefined) {
  const repo = new CustomersRepository(ctx.restaurantId);
  const order = await repo.findOrder(orderId);
  if (!order) throw new HttpError(404, "Order not found");
  if (!order.invoiceNumber || (order.status !== "billed" && order.status !== "closed")) {
    throw new HttpError(409, "Generate the bill first");
  }
  const restaurant = await repo.findRestaurant("name publicUrl");
  const base = (restaurant?.publicUrl || origin || "").replace(/\/+$/, "");
  const token = jwt.sign({ oid: order._id.toString(), rid: ctx.restaurantId }, billSecret(), {
    audience: "bill",
    expiresIn: `${BILL_LINK_DAYS}d`,
  });
  const url = `${base}/bill/${token}`;
  const phone = normalizePhone(order.customerPhone);
  const total = order.bill?.grandTotal ?? 0;
  const text = `${restaurant?.name ?? "Your restaurant"}: bill ${order.invoiceNumber} for ₹${total.toFixed(2)}. View or download it here: ${url}`;
  return {
    url,
    expiresAt: new Date(Date.now() + BILL_LINK_DAYS * DAY_MS),
    whatsappUrl: `https://wa.me/${phone ?? ""}?text=${encodeURIComponent(text)}`,
    hasPhone: !!phone,
  };
}

async function billFromToken(restaurantId: string, token: string) {
  let payload: { oid?: string; rid?: string };
  try {
    payload = jwt.verify(token, billSecret(), { audience: "bill" }) as { oid?: string; rid?: string };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError)
      throw new HttpError(410, "This bill link has expired. Ask the restaurant for a new one.");
    throw new HttpError(404, "Bill not found");
  }
  if (payload.rid !== restaurantId || !payload.oid || !Types.ObjectId.isValid(payload.oid))
    throw new HttpError(404, "Bill not found");
  const repo = new CustomersRepository(restaurantId);
  const order = await repo.findOrder(payload.oid);
  if (!order?.invoiceNumber) throw new HttpError(404, "Bill not found");
  const [items, restaurant] = await Promise.all([repo.findItems(order._id), repo.findRestaurant("")]);
  if (!restaurant) throw new HttpError(404, "Bill not found");
  return { order, items, restaurant, totals: totalsForOrder(order, items, restaurant) };
}

export async function publicBill(restaurantId: string, token: string) {
  const { order, items, restaurant, totals } = await billFromToken(restaurantId, token);
  return {
    restaurant: {
      name: restaurant.name,
      address: restaurant.address ?? "",
      gstin: restaurant.gstin ?? "",
      fssaiLicense: restaurant.fssaiLicense ?? "",
      logoUrl: restaurant.logoUrl ?? "",
    },
    order: {
      invoiceNumber: order.invoiceNumber,
      billedAt: order.billedAt ?? order.createdAt,
      customerName: order.customerName,
      orderType: order.orderType,
      status: order.status,
      voided: !!order.voidedAt,
      paymentMethod: order.paymentMethod,
      couponCode: order.couponCode ?? null,
    },
    items: items
      .filter((i) => i.status !== "cancelled")
      .map((i) => ({
        foodName: i.foodName,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        total: i.total,
        complimentary: !!i.complimentary,
      })),
    totals,
  };
}

export async function publicBillPdfData(restaurantId: string, token: string) {
  return billFromToken(restaurantId, token);
}
