import { Request, Response, Router } from "express";
import { z } from "zod";

import { getContext } from "../../core/context";
import { objectId, parse } from "../../core/validate";
import { asyncHandler } from "../../middleware/errorHandler";
import { requireAuth, requireModule } from "../../middleware/auth";
import * as menuRemove from "./menuRemove.service";

const idParams = z.object({ id: objectId() });

export const menuRemoveRoutes = Router();

// DELETE counts as an edit for requireModule, so these need edit access to the same page that lists them.
menuRemoveRoutes.delete(
  "/food-items/:id",
  requireAuth("admin"),
  requireModule("foodItems"),
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await menuRemove.removeFoodItem(getContext(req), parse(idParams, req.params).id));
  })
);
menuRemoveRoutes.delete(
  "/subcategories/:id",
  requireAuth("admin"),
  requireModule("subcategories"),
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await menuRemove.removeSubcategory(getContext(req), parse(idParams, req.params).id));
  })
);
menuRemoveRoutes.delete(
  "/categories/:id",
  requireAuth("admin"),
  requireModule("categories"),
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await menuRemove.removeCategory(getContext(req), parse(idParams, req.params).id));
  })
);
