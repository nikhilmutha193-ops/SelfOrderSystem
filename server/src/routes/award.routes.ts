import { Router } from "express";
import { listAwards, createAward, updateAward, setAwardActive, deleteAward } from "../controllers/award.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth("admin"), listAwards);
router.post("/", requireAuth("admin"), createAward);
router.put("/:id", requireAuth("admin"), updateAward);
router.patch("/:id/active", requireAuth("admin"), setAwardActive);
router.delete("/:id", requireAuth("admin"), deleteAward);

export default router;
