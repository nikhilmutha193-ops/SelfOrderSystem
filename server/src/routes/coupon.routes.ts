import { Router } from "express";

import {
  createCoupon,
  deleteCoupon,
  listCoupons,
  setCouponActive,
  updateCoupon,
} from "../controllers/coupon.controller";
import { requireAuth, requireModule } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth("admin"), requireModule("coupons"), listCoupons);
router.post("/", requireAuth("admin"), requireModule("coupons"), createCoupon);
router.put("/:id", requireAuth("admin"), requireModule("coupons"), updateCoupon);
router.patch("/:id/active", requireAuth("admin"), requireModule("coupons"), setCouponActive);
router.delete("/:id", requireAuth("admin"), requireModule("coupons"), deleteCoupon);

export default router;
