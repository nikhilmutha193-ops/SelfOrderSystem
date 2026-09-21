import { Router } from "express";
import { submitReview, submitFoodReview, listReviews, setReviewApproved, deleteReview } from "../controllers/review.controller";
import { requireAuth, requireModule } from "../middleware/auth";

const router = Router();

router.post("/", requireAuth("table"), requireModule("reviews"), submitReview);
router.post("/food", requireAuth("table"), requireModule("reviews"), submitFoodReview);
router.get("/", requireAuth("admin"), requireModule("reviews"), listReviews);
router.patch("/:id/approve", requireAuth("admin"), requireModule("reviews"), setReviewApproved);
router.delete("/:id", requireAuth("admin"), requireModule("reviews"), deleteReview);

export default router;
