import { Router } from "express";

import {
  adminChangePassword,
  adminForgotPassword,
  adminLogin,
  adminMe,
  adminSecurityQuestion,
  chefLogin,
  refreshSession,
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
router.post("/refresh", requireAuth("admin", "chef"), refreshSession);

export default router;
