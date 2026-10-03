import { Request, Response } from "express";

import { asyncHandler } from "../../middleware/errorHandler";
import { HttpError } from "../../utils/httpError";
import { menuRecommendations } from "./recommendations.service";

export const getRecommendations = asyncHandler(async (req: Request, res: Response) => {
  if (!req.restaurantId) throw new HttpError(500, "Restaurant not resolved");
  res.set("Cache-Control", "public, max-age=120");
  res.json(await menuRecommendations(req.restaurantId));
});
