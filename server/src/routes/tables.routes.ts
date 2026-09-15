import { Router } from "express";
import { listTables, listAvailableTables, createTable, updateTable, releaseTable } from "../controllers/tables.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/available", listAvailableTables);

router.get("/", requireAuth("admin"), listTables);
router.post("/", requireAuth("admin"), createTable);
router.put("/:id", requireAuth("admin"), updateTable);
router.patch("/:id/release", requireAuth("admin"), releaseTable);

export default router;
