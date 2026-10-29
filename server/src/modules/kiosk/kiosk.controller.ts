import { NextFunction, Request, Response } from "express";
import { HydratedDocument } from "mongoose";

import { getContext } from "../../core/context";
import { idempotencyKey, runIdempotent } from "../../core/idempotency";
import { parse } from "../../core/validate";
import { asyncHandler } from "../../middleware/errorHandler";
import { IKioskDevice } from "../../models/KioskDevice";
import { confirmCheckoutSchema } from "../payments/payments.schema";
import {
  deviceIdParams,
  deviceNameSchema,
  kioskOrderSchema,
  kioskSettingsSchema,
  orderIdParams,
  pairSchema,
} from "./kiosk.schema";
import * as kiosk from "./kiosk.service";

function deviceOf(res: Response): HydratedDocument<IKioskDevice> {
  return res.locals.kioskDevice as HydratedDocument<IKioskDevice>;
}

/** Kiosk screens send "Authorization: Kiosk <token>" from pairing. */
export const requireKiosk = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Kiosk ")) {
    res.status(401).json({ message: "This kiosk is not paired" });
    return;
  }
  const device = await kiosk.authenticateDevice(req.restaurantId!, header.slice("Kiosk ".length).trim());
  if (!device) {
    res.status(401).json({ message: "This kiosk was removed or needs to be paired again" });
    return;
  }
  res.locals.kioskDevice = device;
  next();
});

// ---- Staff ----

export const listDevices = asyncHandler(async (req: Request, res: Response) => {
  res.json(await kiosk.listDevices(getContext(req)));
});

export const createDevice = asyncHandler(async (req: Request, res: Response) => {
  const { name } = parse(deviceNameSchema, req.body);
  res.status(201).json(await kiosk.createDevice(getContext(req), name));
});

export const renewPairingCode = asyncHandler(async (req: Request, res: Response) => {
  const { deviceId } = parse(deviceIdParams, req.params);
  res.json(await kiosk.renewPairingCode(getContext(req), deviceId));
});

export const revokeDevice = asyncHandler(async (req: Request, res: Response) => {
  const { deviceId } = parse(deviceIdParams, req.params);
  res.json(await kiosk.revokeDevice(getContext(req), deviceId));
});

export const getSettings = asyncHandler(async (req: Request, res: Response) => {
  res.json(await kiosk.getKioskSettings(getContext(req)));
});

export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  res.json(await kiosk.updateKioskSettings(getContext(req), parse(kioskSettingsSchema, req.body)));
});

// ---- The kiosk device ----

export const pair = asyncHandler(async (req: Request, res: Response) => {
  const { code } = parse(pairSchema, req.body);
  res.json(await kiosk.pairDevice(req.restaurantId!, code));
});

export const getConfig = asyncHandler(async (req: Request, res: Response) => {
  res.json(await kiosk.getConfig(req.restaurantId!, deviceOf(res)));
});

export const placeOrder = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(kioskOrderSchema, req.body);
  const device = deviceOf(res);
  // A double tap on "Pay" must not place two orders. runIdempotent only needs the restaurant.
  const ctx = {
    restaurantId: req.restaurantId!,
    auth: { role: "kiosk" as const, restaurantId: req.restaurantId!, id: device._id.toString() },
  };
  const result = await runIdempotent(ctx, idempotencyKey(req), "kiosk.order", async () => ({
    status: 201,
    body: await kiosk.placeOrder(req.restaurantId!, device, input),
  }));
  res.status(result.status).json(result.body);
});

export const getOrder = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = parse(orderIdParams, req.params);
  res.json(await kiosk.getKioskOrder(req.restaurantId!, deviceOf(res), orderId));
});

export const payAtCounter = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = parse(orderIdParams, req.params);
  res.json(await kiosk.payAtCounter(req.restaurantId!, deviceOf(res), orderId));
});

export const cancelOrder = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = parse(orderIdParams, req.params);
  res.json(await kiosk.cancelKioskOrder(req.restaurantId!, deviceOf(res), orderId));
});

export const startCheckout = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = parse(orderIdParams, req.params);
  res.status(201).json(await kiosk.startKioskCheckout(req.restaurantId!, deviceOf(res), orderId));
});

export const confirmCheckout = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(confirmCheckoutSchema, req.body);
  res.json(await kiosk.confirmKioskCheckout(req.restaurantId!, deviceOf(res), input));
});

export const pickupBoard = asyncHandler(async (req: Request, res: Response) => {
  res.set("Cache-Control", "no-store");
  res.json(await kiosk.getPickupBoard(req.restaurantId!));
});
