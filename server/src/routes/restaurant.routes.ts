import { Router } from "express";
import {
  getRestaurantPublic,
  getRestaurantSettings,
  updateRestaurantSettings,
  previewKotPdf,
  previewInvoicePdf,
  seedLandingSampleContent,
} from "../controllers/restaurant.controller";
import { requireAuth, requireModule } from "../middleware/auth";

const router = Router();

router.get("/public", getRestaurantPublic);
router.get("/settings", requireAuth("admin"), requireModule("settings"), getRestaurantSettings);
router.put("/settings", requireAuth("admin"), requireModule("settings"), updateRestaurantSettings);
router.post("/kot-preview", requireAuth("admin"), requireModule("settings"), previewKotPdf);
router.post("/invoice-preview", requireAuth("admin"), requireModule("settings"), previewInvoicePdf);
router.post("/seed-landing", requireAuth("admin"), requireModule("settings"), seedLandingSampleContent);

export default router;
