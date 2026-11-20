import { Router } from "express";

import { copyDb, getDbConfig, switchDb, testDbConnection, useEnvDb } from "../controllers/dbconfig.controller";
import { requireAuth, requireModule } from "../middleware/auth";

const router = Router();

// Every handler also checks for the owner account; the module gate is the same as for backups.
router.get("/", requireAuth("admin"), requireModule("backup"), getDbConfig);
router.post("/test", requireAuth("admin"), requireModule("backup"), testDbConnection);
router.post("/copy", requireAuth("admin"), requireModule("backup"), copyDb);
router.post("/switch", requireAuth("admin"), requireModule("backup"), switchDb);
router.post("/use-env", requireAuth("admin"), requireModule("backup"), useEnvDb);

export default router;
