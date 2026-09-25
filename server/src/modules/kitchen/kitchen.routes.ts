import { Router } from "express";

import { requireAuth, requireModule } from "../../middleware/auth";
import {
  getKotPdf,
  getKotQueue,
  markItemReady,
  printKot,
  serveOrderItem,
  startPreparingItem,
} from "./kitchen.controller";

const router = Router();

router.get("/kot/queue", requireAuth("chef", "admin"), requireModule("kot"), getKotQueue);
router.post("/:orderId/kot/print", requireAuth("chef", "admin"), requireModule("kot"), printKot);
router.get("/:orderId/kot/:round/pdf", requireAuth("chef", "admin"), requireModule("kot"), getKotPdf);

router.patch("/items/:itemId/preparing", requireAuth("chef", "admin"), requireModule("kot"), startPreparingItem);
router.patch("/items/:itemId/ready", requireAuth("chef", "admin"), requireModule("kot"), markItemReady);
router.patch("/items/:itemId/serve", requireAuth("chef", "admin"), requireModule("kot"), serveOrderItem);

export default router;
