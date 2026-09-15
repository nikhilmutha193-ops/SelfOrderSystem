import { Router } from "express";
import { submitReview, listReviews, setReviewApproved, deleteReview } from "../controllers/review.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.post("/", requireAuth("table"), submitReview);
router.get("/", requireAuth("admin"), listReviews);
router.patch("/:id/approve", requireAuth("admin"), setReviewApproved);
router.delete("/:id", requireAuth("admin"), deleteReview);

export default router;
