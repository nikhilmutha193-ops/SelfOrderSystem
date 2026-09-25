import { Router } from "express";

import { createOnlineOrder, getAggregatorConfig, regenerateWebhookSecret } from "../controllers/aggregator.controller";
import { requireAuth, requireModule } from "../middleware/auth";

const router = Router();

router.get("/config", requireAuth("admin"), requireModule("orders"), getAggregatorConfig);
router.post("/secret", requireAuth("admin"), requireModule("orders"), regenerateWebhookSecret);
router.post("/orders", requireAuth("admin"), requireModule("orders"), createOnlineOrder);

export default router;
