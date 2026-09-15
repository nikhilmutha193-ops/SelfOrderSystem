import { Router } from "express";
import { getDashboardSummary } from "../controllers/dashboard.controller";
import { requireAuth, requireModule } from "../middleware/auth";

const router = Router();

router.get("/summary", requireAuth("admin"), requireModule("dashboard"), getDashboardSummary);

export default router;
