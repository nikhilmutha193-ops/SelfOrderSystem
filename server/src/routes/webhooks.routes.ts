import { Router } from "express";

import { aggregatorWebhook } from "../controllers/aggregator.controller";

const router = Router();

router.post("/aggregator/:platform", aggregatorWebhook);

export default router;
