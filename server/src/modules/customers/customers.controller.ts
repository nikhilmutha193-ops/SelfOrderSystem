import { Request, Response } from "express";

import { getContext } from "../../core/context";
import { parse } from "../../core/validate";
import { asyncHandler } from "../../middleware/errorHandler";
import { streamInvoicePdf } from "../../utils/pdf";
import {
  attachSchema,
  birthdaySmsSettingsSchema,
  idParams,
  listQuery,
  lookupQuery,
  loyaltySettingsSchema,
  orderParams,
  redeemSchema,
  sendCampaignSchema,
  smsTemplateSchema,
  tokenParams,
  updateCustomerSchema,
} from "./customers.schema";
import * as customers from "./customers.service";

export const listCustomers = asyncHandler(async (req: Request, res: Response) => {
  const { segment, q } = parse(listQuery, req.query);
  res.json(await customers.listCustomers(getContext(req), segment, q));
});

export const lookup = asyncHandler(async (req: Request, res: Response) => {
  const { phone } = parse(lookupQuery, req.query);
  res.json(await customers.lookup(getContext(req), phone));
});

export const guestLookup = asyncHandler(async (req: Request, res: Response) => {
  const { phone } = parse(lookupQuery, req.query);
  res.json(await customers.guestLookup(getContext(req).restaurantId, phone));
});

export const profile = asyncHandler(async (req: Request, res: Response) => {
  const { id } = parse(idParams, req.params);
  res.json(await customers.customerProfile(getContext(req), id));
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const { id } = parse(idParams, req.params);
  const input = parse(updateCustomerSchema, req.body);
  res.json(await customers.updateCustomer(getContext(req), id, input));
});

export const getSettings = asyncHandler(async (req: Request, res: Response) => {
  res.json(await customers.getLoyaltySettings(getContext(req)));
});

export const saveSettings = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(loyaltySettingsSchema, req.body);
  res.json(await customers.saveLoyaltySettings(getContext(req), input));
});

export const getBirthdaySmsSettings = asyncHandler(async (req: Request, res: Response) => {
  res.json(await customers.getBirthdaySmsSettings(getContext(req)));
});

export const saveBirthdaySmsSettings = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(birthdaySmsSettingsSchema, req.body);
  res.json(await customers.saveBirthdaySmsSettings(getContext(req), input));
});

export const sendBirthdaySmsNow = asyncHandler(async (req: Request, res: Response) => {
  res.json(await customers.sendBirthdayGreetingsNow(getContext(req)));
});

export const orderCustomer = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = parse(orderParams, req.params);
  res.json(await customers.orderCustomer(getContext(req), orderId));
});

export const attach = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = parse(orderParams, req.params);
  const { phone, name } = parse(attachSchema, req.body);
  res.json(await customers.attachToOrder(getContext(req), orderId, phone, name));
});

export const redeem = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = parse(orderParams, req.params);
  const { points } = parse(redeemSchema, req.body);
  res.json(await customers.redeemPoints(getContext(req), orderId, points));
});

export const removeRedemption = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = parse(orderParams, req.params);
  res.json(await customers.removeRedemption(getContext(req), orderId));
});

export const shareBill = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = parse(orderParams, req.params);
  res.json(await customers.shareBill(getContext(req), orderId, req.get("origin") ?? undefined));
});

export const publicBill = asyncHandler(async (req: Request, res: Response) => {
  const { token } = parse(tokenParams, req.params);
  res.set("Cache-Control", "private, no-store");
  res.json(await customers.publicBill(req.restaurantId!, token));
});

export const publicBillPdf = asyncHandler(async (req: Request, res: Response) => {
  const { token } = parse(tokenParams, req.params);
  await streamInvoicePdf(res, await customers.publicBillPdfData(req.restaurantId!, token));
});

export const listSmsTemplates = asyncHandler(async (req: Request, res: Response) => {
  res.json(await customers.listSmsTemplates(getContext(req)));
});

export const createSmsTemplate = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(smsTemplateSchema, req.body);
  res.status(201).json(await customers.createSmsTemplate(getContext(req), input));
});

export const updateSmsTemplate = asyncHandler(async (req: Request, res: Response) => {
  const { id } = parse(idParams, req.params);
  const input = parse(smsTemplateSchema, req.body);
  res.json(await customers.updateSmsTemplate(getContext(req), id, input));
});

export const deleteSmsTemplate = asyncHandler(async (req: Request, res: Response) => {
  const { id } = parse(idParams, req.params);
  await customers.deleteSmsTemplate(getContext(req), id);
  res.status(204).send();
});

export const sendSmsCampaign = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(sendCampaignSchema, req.body);
  res.status(201).json(await customers.sendSmsCampaign(getContext(req), input));
});

export const listSmsCampaigns = asyncHandler(async (req: Request, res: Response) => {
  res.json(await customers.listSmsCampaigns(getContext(req)));
});
