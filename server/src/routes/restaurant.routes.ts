import { Router } from "express";
import {
  getRestaurantPublic,
  getRestaurantLogo,
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
// Any signed-in admin can pull the logo for the QR card, regardless of module access.
router.get("/logo", requireAuth("admin"), getRestaurantLogo);
router.get("/settings", requireAuth("admin"), requireModule("settings"), getRestaurantSettings);
router.put("/settings", requireAuth("admin"), requireModule("settings"), updateRestaurantSettings);
router.post("/kot-preview", requireAuth("admin"), requireModule("settings"), previewKotPdf);
router.post("/invoice-preview", requireAuth("admin"), requireModule("settings"), previewInvoicePdf);
router.post("/seed-landing", requireAuth("admin"), requireModule("settings"), seedLandingSampleContent);
router.get("/landing-content", requireAuth("admin"), requireModule("landing"), getLandingContent);
router.put("/landing-content", requireAuth("admin"), requireModule("landing"), updateLandingContent);

export default router;
