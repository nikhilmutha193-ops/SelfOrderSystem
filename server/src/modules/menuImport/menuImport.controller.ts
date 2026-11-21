import { Request, Response } from "express";

import { getContext } from "../../core/context";
import { parse } from "../../core/validate";
import { asyncHandler } from "../../middleware/errorHandler";
import { importSchema } from "./menuImport.schema";
import * as menuImport from "./menuImport.service";

export const exportMenu = asyncHandler(async (req: Request, res: Response) => {
  res.json(await menuImport.exportMenu(getContext(req)));
});

export const previewImport = asyncHandler(async (req: Request, res: Response) => {
  res.json(await menuImport.previewImport(getContext(req), parse(importSchema, req.body)));
});

export const applyImport = asyncHandler(async (req: Request, res: Response) => {
  res.json(await menuImport.applyImport(getContext(req), parse(importSchema, req.body)));
});
