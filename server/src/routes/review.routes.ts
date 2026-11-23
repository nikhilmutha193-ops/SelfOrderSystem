import { Router } from "express";

import {
  deleteReview,
  getFeedbackSettings,
  getPublicFeedbackInfo,
  listReviews,
  setReviewApproved,
  submitFoodReview,
  submitPublicReview,
  submitReview,
  syncGoogle,
  updateFeedbackSettings,
} from "../controllers/review.controller";
import { requireAuth, requireModule } from "../middleware/auth";

const router = Router();

// The feedback QR: anyone who scans it may leave feedback, without signing in to a table.
router.get("/public/info", getPublicFeedbackInfo);
router.post("/public", submitPublicReview);

router.post("/", requireAuth("table"), requireModule("reviews"), submitReview);
router.get("/settings", requireAuth("admin"), requireModule("reviews"), getFeedbackSettings);
router.put("/settings", requireAuth("admin"), requireModule("reviews"), updateFeedbackSettings);
router.post("/google/sync", requireAuth("admin"), requireModule("reviews"), syncGoogle);
router.post("/food", requireAuth("table"), requireModule("reviews"), submitFoodReview);
router.get("/", requireAuth("admin"), requireModule("reviews"), listReviews);
router.patch("/:id/approve", requireAuth("admin"), requireModule("reviews"), setReviewApproved);
router.delete("/:id", requireAuth("admin"), requireModule("reviews"), deleteReview);

export default router;
