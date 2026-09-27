import { Router } from "express";

import { requireAuth, requireModule } from "../../middleware/auth";
import {
  addCashMovement,
  closeDay,
  closeShift,
  getCurrentShift,
  getDayClose,
  listDayCloses,
  listShifts,
  openShift,
  previewDay,
} from "./shifts.controller";

export const shiftRoutes = Router();

shiftRoutes.use(requireAuth("admin"), requireModule("dayClose"));
shiftRoutes.get("/current", getCurrentShift);
shiftRoutes.get("/", listShifts);
shiftRoutes.post("/open", openShift);
shiftRoutes.post("/current/cash", addCashMovement);
shiftRoutes.post("/current/close", closeShift);

export const dayCloseRoutes = Router();

dayCloseRoutes.use(requireAuth("admin"), requireModule("dayClose"));
dayCloseRoutes.get("/preview", previewDay);
dayCloseRoutes.get("/", listDayCloses);
dayCloseRoutes.post("/", closeDay);
dayCloseRoutes.get("/:date", getDayClose);
