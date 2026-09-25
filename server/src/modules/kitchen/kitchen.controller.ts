import { Request, Response } from "express";

import { getContext } from "../../core/context";
import { parse } from "../../core/validate";
import { asyncHandler } from "../../middleware/errorHandler";
import { streamKotPdf } from "../../utils/pdf";
import { itemIdParams, orderIdParams } from "../orders/orders.schema";
import { kotPdfParams, kotQueueQuery } from "./kitchen.schema";
import * as kitchenService from "./kitchen.service";

export const getKotQueue = asyncHandler(async (req: Request, res: Response) => {
  const { tableId } = parse(kotQueueQuery, req.query);
  res.json(await kitchenService.getKotQueue(getContext(req), tableId));
});

export const printKot = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = parse(orderIdParams, req.params);
  res.json(await kitchenService.printKot(getContext(req), orderId));
});

export const getKotPdf = asyncHandler(async (req: Request, res: Response) => {
  const { orderId, round } = parse(kotPdfParams, req.params);
  await streamKotPdf(res, await kitchenService.getKotPdfData(getContext(req), orderId, round));
});

export const startPreparingItem = asyncHandler(async (req: Request, res: Response) => {
  const { itemId } = parse(itemIdParams, req.params);
  res.json(await kitchenService.startPreparingItem(getContext(req), itemId));
});

export const markItemReady = asyncHandler(async (req: Request, res: Response) => {
  const { itemId } = parse(itemIdParams, req.params);
  res.json(await kitchenService.markItemReady(getContext(req), itemId));
});

export const serveOrderItem = asyncHandler(async (req: Request, res: Response) => {
  const { itemId } = parse(itemIdParams, req.params);
  res.json(await kitchenService.serveOrderItem(getContext(req), itemId));
});
