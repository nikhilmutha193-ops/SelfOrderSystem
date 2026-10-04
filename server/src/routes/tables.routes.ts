import { Router } from "express";

import {
  createTable,
  deleteTable,
  getTableLoginSettings,
  listAvailableTables,
  listCaptains,
  listTables,
  releaseOwnTableSession,
  releaseTable,
  setTableCaptain,
  updateTable,
  updateTableLoginSettings,
} from "../controllers/tables.controller";
import { requireAuth, requireModule } from "../middleware/auth";

const router = Router();

router.get("/available", listAvailableTables);
// Guest self-service: end my own not-yet-ordered table session (e.g. "Change table"/"Back").
router.patch("/session/release", requireAuth("table"), releaseOwnTableSession);

router.get("/", requireAuth("admin"), requireModule("tables"), listTables);
router.get("/captains", requireAuth("admin"), requireModule("tables"), listCaptains);
// Registered before the "/:id" routes below, so "settings" is never matched as a table id.
router.get("/settings", requireAuth("admin"), requireModule("tables"), getTableLoginSettings);
router.put("/settings", requireAuth("admin"), requireModule("tables"), updateTableLoginSettings);
router.put("/:id/captain", requireAuth("admin"), requireModule("tables"), setTableCaptain);
router.post("/", requireAuth("admin"), requireModule("tables"), createTable);
router.put("/:id", requireAuth("admin"), requireModule("tables"), updateTable);
router.patch("/:id/release", requireAuth("admin"), requireModule("tables"), releaseTable);
router.delete("/:id", requireAuth("admin"), requireModule("tables"), deleteTable);

export default router;
