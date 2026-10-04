import { Router } from "express";

import { requireAuth, requireModule } from "../../middleware/auth";
import { createOrder, getFloor, getMenu, syncOfflineOrder } from "./pos.controller";

const router = Router();

router.use(requireAuth("admin"), requireModule("orders"));
router.get("/menu", getMenu);
router.get("/floor", getFloor);
router.post("/orders", createOrder);
router.post("/offline-orders", syncOfflineOrder);

export default router;
