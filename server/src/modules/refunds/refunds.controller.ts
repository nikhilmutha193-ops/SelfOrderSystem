import { Request, Response } from "express";

import { getContext } from "../../core/context";
import { parse } from "../../core/validate";
import { asyncHandler } from "../../middleware/errorHandler";
import { createRefundSchema, orderIdParam, refundListQuery } from "./refunds.schema";
import * as service from "./refunds.service";

export const getRefundSummary = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = parse(orderIdParam, req.params);
  res.json(await service.refundSummary(getContext(req), orderId));
});

export const createRefund = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(createRefundSchema, req.body);
  res.status(201).json(await service.createRefund(getContext(req), input));
});

export const listRefunds = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.listRefunds(getContext(req), parse(refundListQuery, req.query)));
});
