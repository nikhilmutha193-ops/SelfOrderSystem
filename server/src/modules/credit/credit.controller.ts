import { Request, Response } from "express";

import { getContext } from "../../core/context";
import { parse } from "../../core/validate";
import { asyncHandler } from "../../middleware/errorHandler";
import { creditLimitSchema, creditPaymentSchema, customerParams } from "./credit.schema";
import * as credit from "./credit.service";

export const getCustomerCredit = asyncHandler(async (req: Request, res: Response) => {
  const { id } = parse(customerParams, req.params);
  res.json(await credit.customerCredit(getContext(req), id));
});

export const putCreditLimit = asyncHandler(async (req: Request, res: Response) => {
  const { id } = parse(customerParams, req.params);
  const { creditLimit } = parse(creditLimitSchema, req.body);
  res.json(await credit.setCreditLimit(getContext(req), id, creditLimit));
});

export const postCreditPayment = asyncHandler(async (req: Request, res: Response) => {
  const { id } = parse(customerParams, req.params);
  const input = parse(creditPaymentSchema, req.body);
  res.status(201).json(await credit.recordPayment(getContext(req), id, input));
});

export const getDues = asyncHandler(async (req: Request, res: Response) => {
  res.json(await credit.listDues(getContext(req)));
});
