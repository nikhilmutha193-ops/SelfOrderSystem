import { Request, Response } from "express";

import { getContext } from "../../core/context";
import { parse } from "../../core/validate";
import { asyncHandler } from "../../middleware/errorHandler";
import {
  cashMovementSchema,
  closeDaySchema,
  closeShiftSchema,
  dateParams,
  dayQuery,
  openShiftSchema,
} from "./shifts.schema";
import * as shifts from "./shifts.service";

export const getCurrentShift = asyncHandler(async (req: Request, res: Response) => {
  res.json({ shift: await shifts.currentShift(getContext(req)) });
});

export const listShifts = asyncHandler(async (req: Request, res: Response) => {
  res.json(await shifts.listShifts(getContext(req)));
});

export const openShift = asyncHandler(async (req: Request, res: Response) => {
  const { openingFloat } = parse(openShiftSchema, req.body);
  res.status(201).json(await shifts.openShift(getContext(req), openingFloat));
});

export const addCashMovement = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(cashMovementSchema, req.body);
  res.json(await shifts.addCashMovement(getContext(req), input));
});

export const closeShift = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(closeShiftSchema, req.body);
  res.json(await shifts.closeShift(getContext(req), input));
});

export const previewDay = asyncHandler(async (req: Request, res: Response) => {
  const { date } = parse(dayQuery, req.query);
  res.json(await shifts.buildDayReport(getContext(req), date));
});

export const closeDay = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(closeDaySchema, req.body);
  res.json(await shifts.closeDay(getContext(req), input));
});

export const listDayCloses = asyncHandler(async (req: Request, res: Response) => {
  res.json(await shifts.listDayCloses(getContext(req)));
});

export const getDayClose = asyncHandler(async (req: Request, res: Response) => {
  const { date } = parse(dateParams, req.params);
  res.json(await shifts.getDayClose(getContext(req), date));
});
