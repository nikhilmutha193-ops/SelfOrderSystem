import { Router } from "express";
import {
  adminLogin,
  adminSecurityQuestion,
  adminForgotPassword,
  adminChangePassword,
  adminMe,
  chefLogin,
  tableLogin,
} from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.post("/admin/login", adminLogin);
router.get("/admin/security-question", adminSecurityQuestion);
router.post("/admin/forgot-password", adminForgotPassword);
router.post("/admin/change-password", requireAuth("admin"), adminChangePassword);
router.get("/admin/me", requireAuth("admin"), adminMe);

router.post("/chef/login", chefLogin);

router.post("/table/login", tableLogin);

export default router;
