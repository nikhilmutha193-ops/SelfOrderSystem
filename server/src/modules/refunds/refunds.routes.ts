import { Router } from "express";

import { requireAuth, requireModule } from "../../middleware/auth";
import { createRefund, getRefundSummary, listRefunds } from "./refunds.controller";

const refundRoutes = Router();

// Refunds are guarded by Orders access. The Refunds page module only decides who sees that page in the menu.
refundRoutes.post("/", requireAuth("admin"), requireModule("orders"), createRefund);
refundRoutes.get("/order/:orderId", requireAuth("admin"), requireModule("orders"), getRefundSummary);
refundRoutes.get("/", requireAuth("admin"), requireModule("orders"), listRefunds);

export default refundRoutes;
