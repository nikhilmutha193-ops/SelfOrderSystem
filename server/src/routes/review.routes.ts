import { Router } from "express";
import { submitReview, listReviews, setReviewApproved, deleteReview } from "../controllers/review.controller";
import { requireAuth, requireModule } from "../middleware/auth";

const router = Router();

router.post("/", requireAuth("table"), requireModule("reviews"), submitReview);
router.get("/", requireAuth("admin"), requireModule("reviews"), listReviews);
router.patch("/:id/approve", requireAuth("admin"), requireModule("reviews"), setReviewApproved);
router.delete("/:id", requireAuth("admin"), requireModule("reviews"), deleteReview);

export default router;
