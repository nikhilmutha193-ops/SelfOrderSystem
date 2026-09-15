import { Router } from "express";
import { handleImageUpload } from "../controllers/upload.controller";
import { uploadImage } from "../middleware/upload";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.post("/image", requireAuth("admin"), uploadImage, handleImageUpload);

export default router;
