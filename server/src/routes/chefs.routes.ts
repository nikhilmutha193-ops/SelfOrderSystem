import { Router } from "express";

import { createChef, deleteChef, listChefs, updateChef } from "../controllers/chefs.controller";
import { requireAuth, requireModule } from "../middleware/auth";

const router = Router();

router.use(requireAuth("admin"));
router.get("/", listChefs);
router.post("/", createChef);
router.put("/:id", updateChef);
router.delete("/:id", deleteChef);

export default router;
