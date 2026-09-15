import { Router } from "express";
import {
  deleteBackup,
  downloadBackup,
  exportBackup,
  generateBackup,
  getBackupSchedule,
  importBackup,
  listBackups,
  restoreFromRecord,
  updateBackupSchedule,
} from "../controllers/backup.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/export", requireAuth("admin"), exportBackup);
router.post("/import", requireAuth("admin"), importBackup);

router.get("/schedule", requireAuth("admin"), getBackupSchedule);
router.put("/schedule", requireAuth("admin"), updateBackupSchedule);

router.get("/", requireAuth("admin"), listBackups);
router.post("/generate", requireAuth("admin"), generateBackup);
router.get("/:id/download", requireAuth("admin"), downloadBackup);
router.post("/:id/restore", requireAuth("admin"), restoreFromRecord);
router.delete("/:id", requireAuth("admin"), deleteBackup);

export default router;
