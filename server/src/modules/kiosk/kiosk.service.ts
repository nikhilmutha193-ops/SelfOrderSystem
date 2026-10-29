import { createHash, randomBytes, randomInt } from "crypto";
import { HydratedDocument } from "mongoose";

import { RequestContext } from "../../core/context";
import { emit } from "../../core/events";
import { IAdmin } from "../../models/Admin";
import { IKioskDevice } from "../../models/KioskDevice";
import { IKioskSettings } from "../../models/Restaurant";
import { writeAudit } from "../../utils/audit";
import { getBusinessDayStart } from "../../utils/businessDay";
import { HttpError } from "../../utils/httpError";
import { nextTokenNumber } from "../../utils/kotQueue";
import { cancelOrder } from "../orders/orders.billing";
import { addOrderItems, getOrder, getOwnedOrder } from "../orders/orders.service";
import { onlinePaymentAvailable } from "../payments/gateway";
import { confirmCheckout, startCheckout } from "../payments/payments.service";
import { ConfirmCheckoutInput } from "../payments/payments.schema";
import { KioskRepository } from "./kiosk.repository";
import { KioskOrderInput, KioskSettingsInput } from "./kiosk.schema";

type DeviceDoc = HydratedDocument<IKioskDevice>;

const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PAIRING_MINUTES = 15;
const ONLINE_WITHIN_MS = 2 * 60_000;
// A number stays on the pickup board as "Ready" for this long, or until the order is handed over.
const READY_SHOWN_MS = 30 * 60_000;

const DEFAULT_SETTINGS: IKioskSettings = { eatIn: true, takeaway: true, payAtCounter: true, idleSeconds: 60 };

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function pairingCode(): string {
  return Array.from({ length: 8 }, () => PAIRING_ALPHABET[randomInt(PAIRING_ALPHABET.length)]).join("");
}

/** What a kiosk may do: only its own orders (getOwnedOrder checks order.kiosk.deviceId). */
function kioskContext(restaurantId: string, device: DeviceDoc): RequestContext {
  return {
    restaurantId,
    auth: { role: "kiosk", restaurantId, id: device._id.toString() },
    admin: { username: `Kiosk: ${device.name}` } as IAdmin,
  };
}

function settingsOf(restaurant: { kioskSettings?: IKioskSettings } | null): IKioskSettings {
  return { ...DEFAULT_SETTINGS, ...(restaurant?.kioskSettings ?? {}) };
}

// ---- Staff: devices and settings ----

export async function listDevices(ctx: RequestContext) {
  const devices = await new KioskRepository(ctx.restaurantId).listDevices();
  return devices.map((d) => ({
    _id: d._id,
    name: d.name,
    paired: !!d.pairedAt,
    online: !!d.lastSeenAt && Date.now() - d.lastSeenAt.getTime() < ONLINE_WITHIN_MS,
    lastSeenAt: d.lastSeenAt ?? null,
    pairingExpiresAt: d.pairedAt ? null : (d.pairingExpiresAt ?? null),
  }));
}

async function issuePairingCode(device: DeviceDoc) {
  const code = pairingCode();
  device.pairingCodeHash = sha256(code);
  device.pairingExpiresAt = new Date(Date.now() + PAIRING_MINUTES * 60_000);
  await device.save();
  return { deviceId: device._id, name: device.name, pairingCode: code, expiresAt: device.pairingExpiresAt };
}

export async function createDevice(ctx: RequestContext, name: string) {
  const code = pairingCode();
  const device = await new KioskRepository(ctx.restaurantId).createDevice(
    name,
    sha256(code),
    new Date(Date.now() + PAIRING_MINUTES * 60_000)
  );
  await writeAudit(ctx, "kiosk.create", `Added kiosk ${name}`);
  return { deviceId: device._id, name: device.name, pairingCode: code, expiresAt: device.pairingExpiresAt };
}

/** A new code to pair (or re-pair) a kiosk. Pairing again replaces the old device token. */
export async function renewPairingCode(ctx: RequestContext, id: string) {
  const device = await new KioskRepository(ctx.restaurantId).findDevice(id);
  if (!device) throw new HttpError(404, "Kiosk not found");
  return issuePairingCode(device);
}

export async function revokeDevice(ctx: RequestContext, id: string) {
  const device = await new KioskRepository(ctx.restaurantId).findDevice(id);
  if (!device) throw new HttpError(404, "Kiosk not found");
  device.set({ revokedAt: new Date(), tokenHash: undefined, pairingCodeHash: undefined });
  await device.save();
  await writeAudit(ctx, "kiosk.revoke", `Removed kiosk ${device.name}`);
  return { message: "Kiosk removed" };
}

export async function getKioskSettings(ctx: RequestContext) {
  return settingsOf(await new KioskRepository(ctx.restaurantId).findRestaurant());
}

export async function updateKioskSettings(ctx: RequestContext, input: KioskSettingsInput) {
  const saved = await new KioskRepository(ctx.restaurantId).saveKioskSettings(input);
  await writeAudit(ctx, "kiosk.settings", "Updated kiosk settings");
  return settingsOf(saved);
}

// ---- The kiosk device ----

export async function pairDevice(restaurantId: string, code: string) {
  const repo = new KioskRepository(restaurantId);
  const device = await repo.findDeviceByPairingCode(sha256(code));
  if (!device) throw new HttpError(404, "That pairing code is wrong or has expired");
  const token = randomBytes(32).toString("hex");
  device.set({ tokenHash: sha256(token), pairingCodeHash: undefined, pairingExpiresAt: null, pairedAt: new Date() });
  await device.save();
  return { token, name: device.name };
}

export async function authenticateDevice(restaurantId: string, token: string) {
  const device = await new KioskRepository(restaurantId).findDeviceByToken(sha256(token));
  if (!device) return null;
  if (!device.lastSeenAt || Date.now() - device.lastSeenAt.getTime() > 30_000) {
    device.lastSeenAt = new Date();
    await device.save();
  }
  return device;
}

export async function getConfig(restaurantId: string, device: DeviceDoc) {
  const restaurant = await new KioskRepository(restaurantId).findRestaurant();
  return {
    device: { name: device.name },
    restaurant: {
      name: restaurant?.name ?? "",
      logoUrl: restaurant?.logoUrl ?? "",
      heroImages: restaurant?.heroImages ?? [],
    },
    settings: settingsOf(restaurant),
    onlinePayment: await onlinePaymentAvailable(restaurantId),
  };
}

/**
 * Places the guest's order with a pickup number reserved for it. Nothing goes to the kitchen until
 * it is paid (online here, or at the counter). A kiosk serves one guest at a time, so its earlier
 * unpaid orders that weren't left for the counter are cancelled first.
 */
export async function placeOrder(restaurantId: string, device: DeviceDoc, input: KioskOrderInput) {
  const repo = new KioskRepository(restaurantId);
  const restaurant = await repo.findRestaurant();
  const settings = settingsOf(restaurant);
  if (input.orderType === "dine-in" ? !settings.eatIn : !settings.takeaway) {
    throw new HttpError(409, input.orderType === "dine-in" ? "Eating in isn't offered at this kiosk" : "Take away isn't offered at this kiosk");
  }
  const ids = [...new Set(input.items.map((line) => line.foodItemId))];
  if ((await repo.countActiveFoodItems(ids)) !== ids.length) {
    throw new HttpError(409, "One of these dishes just sold out. Please check your order.");
  }

  const ctx = kioskContext(restaurantId, device);
  for (const old of await repo.findAbandonedOrders(device._id)) {
    await cancelOrder(ctx, old._id.toString(), undefined).catch(() => undefined);
  }

  const { tokenNumber } = await nextTokenNumber(
    restaurantId,
    restaurant?.dayEndTime,
    restaurant?.timezone,
    restaurant?.kotSettings?.tokenStart
  );
  const order = await repo.createOrder({
    orderType: input.orderType,
    source: "kiosk",
    customerName: `Kiosk #${tokenNumber}`,
    members: 1,
    status: "open",
    kiosk: { deviceId: device._id, payAtCounter: false },
    pickupNumber: tokenNumber,
  });
  await emit("order.created", { restaurantId, orderId: order._id.toString() });
  try {
    await addOrderItems(ctx, order._id.toString(), { items: input.items });
  } catch (err) {
    await cancelOrder(ctx, order._id.toString(), undefined).catch(() => undefined);
    throw err;
  }
  return getOrder(ctx, order._id.toString());
}

export function getKioskOrder(restaurantId: string, device: DeviceDoc, orderId: string) {
  return getOrder(kioskContext(restaurantId, device), orderId);
}

/** The guest pays cash at the counter: the order waits there (POS Cashier) and goes to the kitchen once paid. */
export async function payAtCounter(restaurantId: string, device: DeviceDoc, orderId: string) {
  const repo = new KioskRepository(restaurantId);
  if (!settingsOf(await repo.findRestaurant()).payAtCounter) {
    throw new HttpError(409, "Paying at the counter isn't offered here. Please pay online.");
  }
  const ctx = kioskContext(restaurantId, device);
  const order = await getOwnedOrder(ctx, orderId);
  if (order.status !== "open") throw new HttpError(409, "This order is already paid or closed");
  await repo.markPayAtCounter(order._id);
  await writeAudit(ctx, "kiosk.payAtCounter", `Kiosk order #${order.pickupNumber} is waiting to be paid at the counter`);
  return getOrder(ctx, orderId);
}

/** The guest gave up (or the kiosk timed out) before paying. */
export async function cancelKioskOrder(restaurantId: string, device: DeviceDoc, orderId: string) {
  const ctx = kioskContext(restaurantId, device);
  const order = await getOwnedOrder(ctx, orderId);
  if (order.status !== "open") throw new HttpError(409, "This order is already paid or closed");
  if (order.kiosk?.payAtCounter) throw new HttpError(409, "This order is waiting at the counter");
  await cancelOrder(ctx, orderId, undefined);
  return { cancelled: true };
}

export function startKioskCheckout(restaurantId: string, device: DeviceDoc, orderId: string) {
  return startCheckout(kioskContext(restaurantId, device), orderId);
}

export function confirmKioskCheckout(restaurantId: string, device: DeviceDoc, input: ConfirmCheckoutInput) {
  return confirmCheckout(kioskContext(restaurantId, device), input);
}

// ---- The pickup board (public, numbers only) ----

export async function getPickupBoard(restaurantId: string) {
  const repo = new KioskRepository(restaurantId);
  const restaurant = await repo.findRestaurant();
  const orders = await repo.findPickupOrders(getBusinessDayStart(new Date(), restaurant?.dayEndTime, restaurant?.timezone));
  const items = await repo.findSentItems(orders.map((o) => o._id));
  const byOrder = new Map<string, typeof items>();
  for (const item of items) {
    const key = item.orderId.toString();
    byOrder.set(key, [...(byOrder.get(key) ?? []), item]);
  }

  const preparing: number[] = [];
  const ready: { number: number; readyAt: number }[] = [];
  for (const order of orders) {
    const sent = byOrder.get(order._id.toString()) ?? [];
    const tokens = sent.map((i) => i.tokenNumber).filter((n): n is number => typeof n === "number");
    const number = order.pickupNumber ?? (tokens.length ? Math.min(...tokens) : null);
    if (number === null || sent.length === 0 || sent.every((i) => i.status === "served")) continue;
    if (sent.some((i) => i.status === "pending" || i.status === "preparing")) {
      preparing.push(number);
      continue;
    }
    const readyAt = Math.max(...sent.map((i) => (i.readyAt ? new Date(i.readyAt).getTime() : 0)));
    if (Date.now() - readyAt < READY_SHOWN_MS) ready.push({ number, readyAt });
  }
  return {
    restaurantName: restaurant?.name ?? "",
    logoUrl: restaurant?.logoUrl ?? "",
    preparing: preparing.sort((a, b) => a - b),
    // Newest first, so the number that just turned ready is at the top.
    ready: ready.sort((a, b) => b.readyAt - a.readyAt).map((r) => r.number),
  };
}
