import { Router } from "express";
import {
  listTables,
  listAvailableTables,
  createTable,
  updateTable,
  releaseTable,
  deleteTable,
} from "../controllers/tables.controller";
import { requireAuth, requireModule } from "../middleware/auth";

const router = Router();

router.get("/available", listAvailableTables);

router.get("/", requireAuth("admin"), requireModule("tables"), listTables);
router.post("/", requireAuth("admin"), requireModule("tables"), createTable);
router.put("/:id", requireAuth("admin"), requireModule("tables"), updateTable);
router.patch("/:id/release", requireAuth("admin"), requireModule("tables"), releaseTable);
router.delete("/:id", requireAuth("admin"), requireModule("tables"), deleteTable);

export default router;
