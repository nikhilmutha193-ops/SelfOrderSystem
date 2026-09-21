import { Request, Response } from "express";
import { randomBytes } from "crypto";
import Order, { DeliveryProvider, OrderSource } from "../models/Order";
import OrderItem from "../models/OrderItem";
import FoodItem from "../models/FoodItem";
import Restaurant from "../models/Restaurant";
import { asyncHandler } from "../middleware/errorHandler";
import { HttpError } from "../utils/httpError";
import { writeAudit } from "../utils/audit";

/** Platform slug (as used in the webhook URL) -> the labels stored on the order. */
const PLATFORMS: Record<string, { source: OrderSource; provider: DeliveryProvider; label: string }> = {
  swiggy: { source: "swiggy", provider: "Swiggy", label: "Swiggy" },
  zomato: { source: "zomato", provider: "Zomato", label: "Zomato" },
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** One line as it arrives from an aggregator/middleware payload. */
interface IncomingItem {
  name?: string;
  quantity?: number;
  price?: number;
  note?: string;
}

/** Normalized aggregator order payload (what UrbanPiper/Petpooja-style middleware sends). */
interface IncomingOrder {
  externalOrderId?: string;
  customerName?: string;
  customerPhone?: string;
  instructions?: string;
  paymentMethod?: "online" | "cash" | "pending";
  discountAmount?: number;
  items?: IncomingItem[];
}

/**
 * Turns a normalized aggregator payload into a real Order + OrderItems so it flows
 * through the existing Dashboard / KOT / Orders / invoice screens. Idempotent on
 * externalOrderId, so a retried webhook delivery won't create a duplicate.
 */
async function ingestOrder(
  req: Request,
  restaurantId: string,
  platformSlug: string,
  body: IncomingOrder
): Promise<{ order: unknown; duplicate: boolean }> {
  const platform = PLATFORMS[platformSlug];
  if (!platform) throw new HttpError(400, "Unknown platform - use 'swiggy' or 'zomato'");

  const items = Array.isArray(body.items) ? body.items.filter((i) => i && i.name) : [];
  if (items.length === 0) throw new HttpError(400, "items must be a non-empty array of { name, quantity, price }");

  const externalOrderId = (body.externalOrderId || "").trim();
  if (externalOrderId) {
    const existing = await Order.findOne({ restaurantId, source: platform.source, externalOrderId });
    if (existing) return { order: existing, duplicate: true };
  }

  // Aggregators are prepaid unless told otherwise, so default the order to "online".
  const paymentMethod = body.paymentMethod === "cash" || body.paymentMethod === "pending" ? body.paymentMethod : "online";

  const order = await Order.create({
    restaurantId,
    orderType: "delivery",
    deliveryProvider: platform.provider,
    source: platform.source,
    externalOrderId: externalOrderId || undefined,
    customerName: (body.customerName || `${platform.label} customer`).trim(),
    customerPhone: (body.customerPhone || "").trim(),
    members: 1,
    status: "open",
    paymentMethod,
    discountAmount: Math.max(0, Number(body.discountAmount) || 0),
  });

  const instructions = (body.instructions || "").trim();
  let longestPrepMinutes = 0;

  for (let i = 0; i < items.length; i++) {
    const line = items[i];
    const name = String(line.name).trim();
    const quantity = Math.max(1, Math.floor(Number(line.quantity) || 1));

    // Try to tie the line to a live menu item so prices, prep time and analytics line up;
    // fall back to a free-form line when the aggregator menu doesn't match ours exactly.
    const food = await FoodItem.findOne({
      restaurantId,
      name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    });

    const unitPrice = round2(
      typeof line.price === "number" && line.price >= 0 ? line.price : food ? food.price : 0
    );
    // The aggregator's own instructions ride along on the first line's kitchen note.
    const note = i === 0 && instructions ? [instructions, line.note].filter(Boolean).join(" - ") : (line.note || "").trim();

    await OrderItem.create({
      restaurantId,
      orderId: order._id,
      ...(food && { foodItemId: food._id }),
      foodName: food ? food.name : name,
      unitPrice,
      quantity,
      total: round2(unitPrice * quantity),
      isJain: false,
      modifiers: [],
      note: note.slice(0, 200),
      status: "pending",
      kotRound: null,
    });

    if (food?.prepTimeMinutes) longestPrepMinutes = Math.max(longestPrepMinutes, food.prepTimeMinutes);
  }

  const restaurant = await Restaurant.findById(restaurantId).select("prepBufferMinutes");
  const buffer = restaurant?.prepBufferMinutes ?? 0;
  if (longestPrepMinutes > 0 || buffer > 0) {
    order.estimatedReadyAt = new Date(Date.now() + (longestPrepMinutes + buffer) * 60 * 1000);
    await order.save();
  }

  await writeAudit(
    req,
    "aggregator.order.received",
    `${platform.label} order${externalOrderId ? ` #${externalOrderId}` : ""} received (${items.length} item${items.length === 1 ? "" : "s"})`
  );

  return { order, duplicate: false };
}

/**
 * Public webhook Swiggy/Zomato (or a middleware like UrbanPiper) posts new orders to.
 * Authenticated by a shared secret rather than an admin session, since the aggregator
 * has no login here. resolveTenant has already set req.restaurantId.
 */
export const aggregatorWebhook = asyncHandler(async (req: Request, res: Response) => {
  const restaurant = await Restaurant.findById(req.restaurantId).select("aggregatorWebhookSecret");
  const secret = restaurant?.aggregatorWebhookSecret;
  if (!secret) throw new HttpError(503, "Aggregator webhook is not configured. Generate a secret in Restaurant Settings.");

  const provided = (req.header("x-webhook-secret") || (req.query.secret as string) || "").trim();
  if (provided !== secret) throw new HttpError(401, "Invalid webhook secret");

  const { order, duplicate } = await ingestOrder(req, req.restaurantId!, req.params.platform, req.body || {});
  res.status(duplicate ? 200 : 201).json({ ok: true, duplicate, orderId: (order as { _id: unknown })._id });
});

/** Admin-side manual entry of an online order (before/without live API access). */
export const createOnlineOrder = asyncHandler(async (req: Request, res: Response) => {
  const platform = (req.body?.platform || "").toString().toLowerCase();
  const { order, duplicate } = await ingestOrder(req, req.restaurantId!, platform, req.body || {});
  res.status(duplicate ? 200 : 201).json(order);
});

/** Returns the webhook config the admin pastes into the aggregator/middleware dashboard. */
export const getAggregatorConfig = asyncHandler(async (req: Request, res: Response) => {
  const restaurant = await Restaurant.findById(req.restaurantId).select("aggregatorWebhookSecret publicUrl");
  res.json({
    secret: restaurant?.aggregatorWebhookSecret || "",
    baseUrl: restaurant?.publicUrl || "",
  });
});

/** Generates (or rotates) the webhook secret. */
export const regenerateWebhookSecret = asyncHandler(async (req: Request, res: Response) => {
  const secret = randomBytes(24).toString("hex");
  await Restaurant.updateOne({ _id: req.restaurantId }, { $set: { aggregatorWebhookSecret: secret } });
  await writeAudit(req, "aggregator.secret.rotated", "Aggregator webhook secret regenerated");
  res.json({ secret });
});
