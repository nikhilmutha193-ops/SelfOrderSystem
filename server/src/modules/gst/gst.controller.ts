import { Request, Response } from "express";

import { getContext } from "../../core/context";
import { parse } from "../../core/validate";
import { asyncHandler } from "../../middleware/errorHandler";
import { gstReportQuery } from "./gst.schema";
import * as service from "./gst.service";

export const getGstReport = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.gstReport(getContext(req), parse(gstReportQuery, req.query)));
});
