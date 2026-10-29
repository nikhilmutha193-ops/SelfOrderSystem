import { Router } from "express";

import { requireAuth, requireModule } from "../../middleware/auth";
import { authLimiter } from "../../middleware/rateLimit";
import {
  cancelOrder,
  confirmCheckout,
  createDevice,
  getConfig,
  getOrder,
  getSettings,
  listDevices,
  pair,
  payAtCounter,
  pickupBoard,
  placeOrder,
  renewPairingCode,
  requireKiosk,
  revokeDevice,
  startCheckout,
  updateSettings,
} from "./kiosk.controller";

const staff = [requireAuth("admin"), requireModule("kiosks")];

export const kioskRoutes = Router();

kioskRoutes.get("/devices", ...staff, listDevices);
kioskRoutes.post("/devices", ...staff, createDevice);
kioskRoutes.post("/devices/:deviceId/pairing-code", ...staff, renewPairingCode);
kioskRoutes.delete("/devices/:deviceId", ...staff, revokeDevice);
kioskRoutes.get("/settings", ...staff, getSettings);
kioskRoutes.put("/settings", ...staff, updateSettings);

// The kiosk screen itself.
kioskRoutes.post("/pair", authLimiter, pair);
kioskRoutes.get("/config", requireKiosk, getConfig);
kioskRoutes.post("/orders", requireKiosk, placeOrder);
kioskRoutes.get("/orders/:orderId", requireKiosk, getOrder);
kioskRoutes.post("/orders/:orderId/pay-at-counter", requireKiosk, payAtCounter);
kioskRoutes.post("/orders/:orderId/cancel", requireKiosk, cancelOrder);
kioskRoutes.post("/orders/:orderId/checkout", requireKiosk, startCheckout);
kioskRoutes.post("/razorpay/confirm", requireKiosk, confirmCheckout);

/** The TV by the counter: order numbers only, so it needs no login. */
export const pickupRoutes = Router();
pickupRoutes.get("/", pickupBoard);
