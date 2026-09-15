import { Router } from "express";
import { listCoupons, createCoupon, updateCoupon, setCouponActive, deleteCoupon } from "../controllers/coupon.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth("admin"), listCoupons);
router.post("/", requireAuth("admin"), createCoupon);
router.put("/:id", requireAuth("admin"), updateCoupon);
router.patch("/:id/active", requireAuth("admin"), setCouponActive);
router.delete("/:id", requireAuth("admin"), deleteCoupon);

export default router;
