import { Request, Response } from "express";

import { getContext } from "../../core/context";
import { idempotencyKey, runIdempotent } from "../../core/idempotency";
import { parse } from "../../core/validate";
import { asyncHandler } from "../../middleware/errorHandler";
import { createPosOrderSchema } from "./pos.schema";
import * as pos from "./pos.service";

export const getMenu = asyncHandler(async (req: Request, res: Response) => {
  res.set("Cache-Control", "private, no-cache");
  res.json(await pos.getMenu(getContext(req)));
});

export const getFloor = asyncHandler(async (req: Request, res: Response) => {
  res.json(await pos.getFloor(getContext(req)));
});

export const createOrder = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(createPosOrderSchema, req.body);
  const ctx = getContext(req);
  const result = await runIdempotent(ctx, idempotencyKey(req), "pos.order", async () => ({
    status: 201,
    body: await pos.createOrder(ctx, input),
  }));
  res.status(result.status).json(result.body);
});
