import { Router } from "express";

import { translateTexts } from "../controllers/translate.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

// Any admin can auto-translate while editing menu content.
router.post("/", requireAuth("admin"), translateTexts);

export default router;
