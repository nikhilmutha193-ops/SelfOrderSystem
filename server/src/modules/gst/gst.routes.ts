import { Router } from "express";

import { requireAuth, requireModule } from "../../middleware/auth";
import { getGstReport } from "./gst.controller";

const gstRoutes = Router();

gstRoutes.get("/report", requireAuth("admin"), requireModule("gst"), getGstReport);

export default gstRoutes;
