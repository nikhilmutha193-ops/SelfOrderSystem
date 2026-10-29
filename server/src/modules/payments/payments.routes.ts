import { Router } from "express";

import { requireAuth, requireModule } from "../../middleware/auth";
import {
  confirmCheckout,
  getSettings,
  listAttention,
  razorpayWebhook,
  startCheckout,
  updateSettings,
} from "./payments.controller";

const router = Router();

router.get("/settings", requireAuth("admin"), requireModule("settings"), getSettings);
router.put("/settings", requireAuth("admin"), requireModule("settings"), updateSettings);
router.get("/attention", requireAuth("admin"), requireModule("orders"), listAttention);
// Guests pay their own order; staff with Orders access can open a checkout for any order.
router.post("/orders/:orderId/checkout", requireAuth("table", "admin"), requireModule("orders"), startCheckout);
router.post("/razorpay/confirm", requireAuth("table", "admin"), requireModule("orders"), confirmCheckout);
// Called by Razorpay, authenticated by its signature (see payments.service handleWebhook).
router.post("/razorpay/webhook", razorpayWebhook);

export default router;
