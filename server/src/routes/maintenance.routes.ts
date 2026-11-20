import { Router } from "express";

import {
  getMaintenanceSettings,
  getMaintenanceStatus,
  updateMaintenanceSettings,
} from "../controllers/maintenance.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/", getMaintenanceStatus); // public: the maintenance page reads it
// Owner only (checked in the controller); not a permission module, so no other login can be given it.
router.get("/settings", requireAuth("admin"), getMaintenanceSettings);
router.put("/settings", requireAuth("admin"), updateMaintenanceSettings);

export default router;
