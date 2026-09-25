import { Router } from "express";

import {
  createTable,
  deleteTable,
  listAvailableTables,
  listTables,
  releaseOwnTableSession,
  releaseTable,
  updateTable,
} from "../controllers/tables.controller";
import { requireAuth, requireModule } from "../middleware/auth";

const router = Router();

router.get("/available", listAvailableTables);
// Guest self-service: end my own not-yet-ordered table session (e.g. "Change table"/"Back").
router.patch("/session/release", requireAuth("table"), releaseOwnTableSession);

router.get("/", requireAuth("admin"), requireModule("tables"), listTables);
router.post("/", requireAuth("admin"), requireModule("tables"), createTable);
router.put("/:id", requireAuth("admin"), requireModule("tables"), updateTable);
router.patch("/:id/release", requireAuth("admin"), requireModule("tables"), releaseTable);
router.delete("/:id", requireAuth("admin"), requireModule("tables"), deleteTable);

export default router;
