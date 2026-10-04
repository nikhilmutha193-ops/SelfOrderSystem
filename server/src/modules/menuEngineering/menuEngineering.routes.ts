import { Router } from "express";

import { requireAuth, requireModule } from "../../middleware/auth";
import { getMenuEngineering } from "./menuEngineering.controller";

const menuEngineeringRoutes = Router();

menuEngineeringRoutes.get("/", requireAuth("admin"), requireModule("analytics"), getMenuEngineering);

export default menuEngineeringRoutes;
