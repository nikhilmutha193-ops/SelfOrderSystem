import { Router } from "express";
import {
  getRestaurantPublic,
  getRestaurantSettings,
  updateRestaurantSettings,
  previewKotPdf,
  previewInvoicePdf,
} from "../controllers/restaurant.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/public", getRestaurantPublic);
router.get("/settings", requireAuth("admin"), getRestaurantSettings);
router.put("/settings", requireAuth("admin"), updateRestaurantSettings);
router.post("/kot-preview", requireAuth("admin"), previewKotPdf);
router.post("/invoice-preview", requireAuth("admin"), previewInvoicePdf);

export default router;
