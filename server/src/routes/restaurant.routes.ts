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
import { getLandingContent, updateLandingContent } from "../controllers/landingContent.controller";

const router = Router();

router.get("/public", getRestaurantPublic);
router.get("/settings", requireAuth("admin"), requireModule("settings"), getRestaurantSettings);
router.put("/settings", requireAuth("admin"), requireModule("settings"), updateRestaurantSettings);
router.post("/kot-preview", requireAuth("admin"), requireModule("settings"), previewKotPdf);
router.post("/invoice-preview", requireAuth("admin"), requireModule("settings"), previewInvoicePdf);
router.post("/seed-landing", requireAuth("admin"), requireModule("settings"), seedLandingSampleContent);
router.get("/landing-content", requireAuth("admin"), requireModule("landing"), getLandingContent);
router.put("/landing-content", requireAuth("admin"), requireModule("landing"), updateLandingContent);

export default router;
