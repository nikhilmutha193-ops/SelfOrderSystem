import { Request, Response } from "express";

import { getContext } from "../../core/context";
import { parse } from "../../core/validate";
import { asyncHandler } from "../../middleware/errorHandler";
import {
  countSchema,
  foodParams,
  idParams,
  movementSchema,
  purchaseSchema,
  rangeQuery,
  recipeSchema,
  settingsSchema,
  stockItemSchema,
  vendorSchema,
} from "./inventory.schema";
import * as inventory from "./inventory.service";

export const listStock = asyncHandler(async (req: Request, res: Response) => {
  res.json(await inventory.listStock(getContext(req)));
});

export const createStockItem = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(stockItemSchema, req.body);
  res.status(201).json(await inventory.createStockItem(getContext(req), input));
});

export const updateStockItem = asyncHandler(async (req: Request, res: Response) => {
  const { id } = parse(idParams, req.params);
  const input = parse(stockItemSchema, req.body);
  res.json(await inventory.updateStockItem(getContext(req), id, input));
});

export const itemLedger = asyncHandler(async (req: Request, res: Response) => {
  const { id } = parse(idParams, req.params);
  res.json(await inventory.itemLedger(getContext(req), id));
});

export const postMovement = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(movementSchema, req.body);
  res.status(201).json(await inventory.postMovement(getContext(req), input));
});

export const listRecipes = asyncHandler(async (req: Request, res: Response) => {
  res.json(await inventory.listRecipes(getContext(req)));
});

export const saveRecipe = asyncHandler(async (req: Request, res: Response) => {
  const { foodItemId } = parse(foodParams, req.params);
  const input = parse(recipeSchema, req.body);
  res.json(await inventory.saveRecipe(getContext(req), foodItemId, input));
});

export const listVendors = asyncHandler(async (req: Request, res: Response) => {
  res.json(await inventory.listVendors(getContext(req)));
});

export const createVendor = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(vendorSchema, req.body);
  res.status(201).json(await inventory.createVendor(getContext(req), input));
});

export const updateVendor = asyncHandler(async (req: Request, res: Response) => {
  const { id } = parse(idParams, req.params);
  const input = parse(vendorSchema, req.body);
  res.json(await inventory.updateVendor(getContext(req), id, input));
});

export const listPurchases = asyncHandler(async (req: Request, res: Response) => {
  const { from, to } = parse(rangeQuery, req.query);
  res.json(await inventory.listPurchases(getContext(req), from, to));
});

export const createPurchase = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(purchaseSchema, req.body);
  res.status(201).json(await inventory.createPurchase(getContext(req), input));
});

export const listCounts = asyncHandler(async (req: Request, res: Response) => {
  res.json(await inventory.listCounts(getContext(req)));
});

export const createCount = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(countSchema, req.body);
  res.status(201).json(await inventory.createCount(getContext(req), input));
});

export const usageReport = asyncHandler(async (req: Request, res: Response) => {
  const { from, to } = parse(rangeQuery, req.query);
  res.json(await inventory.usageReport(getContext(req), from, to));
});

export const getSettings = asyncHandler(async (req: Request, res: Response) => {
  res.json(await inventory.getSettings(getContext(req)));
});

export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const { autoSoldOut } = parse(settingsSchema, req.body);
  res.json(await inventory.updateSettings(getContext(req), autoSoldOut));
});
