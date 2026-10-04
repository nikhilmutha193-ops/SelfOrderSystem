import { Router } from "express";

import { requireAuth, requireModule } from "../../middleware/auth";
import { getAreas, putAreas, putTableArea } from "./pricing.controller";

const pricingRoutes = Router();

pricingRoutes.get("/areas", requireAuth("admin"), getAreas);
pricingRoutes.put("/areas", requireAuth("admin"), requireModule("tables"), putAreas);
pricingRoutes.put("/tables/:id/area", requireAuth("admin"), requireModule("tables"), putTableArea);

export default pricingRoutes;
