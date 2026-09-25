import { Router } from "express";

import {
  deleteBackup,
  downloadBackup,
  exportBackup,
  generateBackup,
  getBackupCapabilities,
  getBackupSchedule,
  importBackup,
  listBackups,
  restoreFromRecord,
  updateBackupSchedule,
} from "../controllers/backup.controller";
import { requireAuth, requireModule } from "../middleware/auth";

const router = Router();

router.get("/capabilities", requireAuth("admin"), requireModule("backup"), getBackupCapabilities);
router.get("/export", requireAuth("admin"), requireModule("backup"), exportBackup);
router.post("/import", requireAuth("admin"), requireModule("backup"), importBackup);

router.get("/schedule", requireAuth("admin"), requireModule("backup"), getBackupSchedule);
router.put("/schedule", requireAuth("admin"), requireModule("backup"), updateBackupSchedule);

router.get("/", requireAuth("admin"), requireModule("backup"), listBackups);
router.post("/generate", requireAuth("admin"), requireModule("backup"), generateBackup);
router.get("/:id/download", requireAuth("admin"), requireModule("backup"), downloadBackup);
router.post("/:id/restore", requireAuth("admin"), requireModule("backup"), restoreFromRecord);
router.delete("/:id", requireAuth("admin"), requireModule("backup"), deleteBackup);

export default router;
