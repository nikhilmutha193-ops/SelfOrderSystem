import { Router } from "express";

import { createAward, deleteAward, listAwards, setAwardActive, updateAward } from "../controllers/award.controller";
import { requireAuth, requireModule } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth("admin"), requireModule("awards"), listAwards);
router.post("/", requireAuth("admin"), requireModule("awards"), createAward);
router.put("/:id", requireAuth("admin"), requireModule("awards"), updateAward);
router.patch("/:id/active", requireAuth("admin"), requireModule("awards"), setAwardActive);
router.delete("/:id", requireAuth("admin"), requireModule("awards"), deleteAward);

export default router;
