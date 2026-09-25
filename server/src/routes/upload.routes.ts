import { Router } from "express";

import { handleImageUpload } from "../controllers/upload.controller";
import { requireAuth } from "../middleware/auth";
import { uploadImage } from "../middleware/upload";

const router = Router();

router.post("/image", requireAuth("admin"), uploadImage, handleImageUpload);

export default router;
