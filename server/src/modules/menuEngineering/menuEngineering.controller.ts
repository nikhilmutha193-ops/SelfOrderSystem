import { Request, Response } from "express";

import { getContext } from "../../core/context";
import { parse } from "../../core/validate";
import { asyncHandler } from "../../middleware/errorHandler";
import { menuEngineeringQuery } from "./menuEngineering.schema";
import * as service from "./menuEngineering.service";

export const getMenuEngineering = asyncHandler(async (req: Request, res: Response) => {
  const { days } = parse(menuEngineeringQuery, req.query);
  res.json(await service.menuEngineering(getContext(req), days));
});
