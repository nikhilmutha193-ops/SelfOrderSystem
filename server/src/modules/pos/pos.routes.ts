import { Router } from "express";

import { requireAuth, requireModule } from "../../middleware/auth";
import {
  createOrder,
  getFloor,
  getMenu,
  getToday,
  markInvoicePrinted,
  printBoth,
  releaseTable,
  syncOfflineOrder,
} from "./pos.controller";

const router = Router();

router.use(requireAuth("admin"), requireModule("orders"));
router.get("/menu", getMenu);
router.get("/floor", getFloor);
router.get("/today", getToday);
router.post("/orders/:orderId/print-both", printBoth);
router.post("/orders/:orderId/invoice-printed", markInvoicePrinted);
router.post("/orders", createOrder);
router.post("/offline-orders", syncOfflineOrder);
router.patch("/tables/:tableId/release", releaseTable);

export default router;
