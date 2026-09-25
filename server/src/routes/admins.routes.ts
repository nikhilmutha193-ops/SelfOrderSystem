import { Router } from "express";

import {
  createAdmin,
  deleteAdmin,
  listAdmins,
  listModules,
  resetAdminPassword,
  updateAdminPermissions,
} from "../controllers/admins.controller";
import { requireAuth, requireModule } from "../middleware/auth";

const router = Router();

router.use(requireAuth("admin"), requireModule("admins"));

router.get("/modules", listModules);
router.get("/", listAdmins);
router.post("/", createAdmin);
router.put("/:id/permissions", updateAdminPermissions);
router.put("/:id/password", resetAdminPassword);
router.delete("/:id", deleteAdmin);

export default router;
