import { Request, Response } from "express";

import { getContext } from "../../core/context";
import { parse } from "../../core/validate";
import { asyncHandler } from "../../middleware/errorHandler";
import { areasSchema, tableAreaSchema, tableParams } from "./pricing.schema";
import * as pricing from "./pricing.service";

export const getAreas = asyncHandler(async (req: Request, res: Response) => {
  res.json(await pricing.listAreas(getContext(req)));
});

export const putAreas = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(areasSchema, req.body);
  res.json(await pricing.saveAreas(getContext(req), input));
});

export const putTableArea = asyncHandler(async (req: Request, res: Response) => {
  const { id } = parse(tableParams, req.params);
  const { areaId } = parse(tableAreaSchema, req.body);
  res.json(await pricing.setTableArea(getContext(req), id, areaId));
});
