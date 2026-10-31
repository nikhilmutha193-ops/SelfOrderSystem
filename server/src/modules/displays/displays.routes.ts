import { Router } from "express";

import { requireAuth, requireModule } from "../../middleware/auth";
import {
  createDisplay,
  deleteDisplay,
  getPublicDisplay,
  listDisplays,
  renewDisplayCode,
  updateDisplay,
} from "./displays.controller";

const displayRoutes = Router();

// Public: a screen is opened with its secret link and shows nothing but its images.
displayRoutes.get("/public/:code", getPublicDisplay);

displayRoutes.use(requireAuth("admin"), requireModule("displays"));
displayRoutes.get("/", listDisplays);
displayRoutes.post("/", createDisplay);
displayRoutes.put("/:id", updateDisplay);
displayRoutes.post("/:id/renew", renewDisplayCode);
displayRoutes.delete("/:id", deleteDisplay);

export default displayRoutes;
