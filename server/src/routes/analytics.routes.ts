import { Router } from "express";
import { getSalesAnalytics, getPrepAnalytics, getAuditLog } from "../controllers/analytics.controller";
import { requireAuth, requireModule } from "../middleware/auth";

const router = Router();

router.get("/sales", requireAuth("admin"), requireModule("analytics"), getSalesAnalytics);
router.get("/prep-times", requireAuth("admin"), requireModule("analytics"), getPrepAnalytics);
router.get("/audit", requireAuth("admin"), requireModule("audit"), getAuditLog);

export default router;
