import { Router } from "express";

import { requireAuth, requireModule } from "../../middleware/auth";
import { applyImport, exportMenu, previewImport } from "./menuImport.controller";

export const menuImportRoutes = Router();

// Same access as the Food Items page: viewing can export, editing can import.
menuImportRoutes.use(requireAuth("admin"), requireModule("foodItems"));
menuImportRoutes.get("/export", exportMenu);
menuImportRoutes.post("/preview", previewImport);
menuImportRoutes.post("/apply", applyImport);
