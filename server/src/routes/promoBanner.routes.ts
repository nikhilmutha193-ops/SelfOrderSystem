import { Router } from "express";

import {
  createPromoBanner,
  deletePromoBanner,
  listPromoBanners,
  setPromoBannerActive,
  updatePromoBanner,
} from "../controllers/promoBanner.controller";
import { requireAuth, requireModule } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth("admin"), requireModule("landing"), listPromoBanners);
router.post("/", requireAuth("admin"), requireModule("landing"), createPromoBanner);
router.put("/:id", requireAuth("admin"), requireModule("landing"), updatePromoBanner);
router.patch("/:id/active", requireAuth("admin"), requireModule("landing"), setPromoBannerActive);
router.delete("/:id", requireAuth("admin"), requireModule("landing"), deletePromoBanner);

export default router;
