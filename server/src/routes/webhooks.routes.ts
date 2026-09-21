import { Router } from "express";
import { aggregatorWebhook } from "../controllers/aggregator.controller";

const router = Router();

// Public - authenticated by the x-webhook-secret header, not an admin session.
// e.g. POST /api/webhooks/aggregator/swiggy  or  /api/webhooks/aggregator/zomato
router.post("/aggregator/:platform", aggregatorWebhook);

export default router;
