import { Request, Response } from "express";

import { getContext } from "../../core/context";
import { parse } from "../../core/validate";
import { asyncHandler } from "../../middleware/errorHandler";
import { HttpError } from "../../utils/httpError";
import { confirmCheckoutSchema, gatewaySettingsSchema, orderIdParams } from "./payments.schema";
import * as payments from "./payments.service";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** The unparsed body, kept only for the payment webhook (signed over the exact bytes). */
      rawBody?: Buffer;
    }
  }
}

export const getSettings = asyncHandler(async (req: Request, res: Response) => {
  res.json(await payments.getGatewaySettings(getContext(req)));
});

export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(gatewaySettingsSchema, req.body);
  res.json(await payments.updateGatewaySettings(getContext(req), input));
});

export const listAttention = asyncHandler(async (req: Request, res: Response) => {
  res.json(await payments.listAttention(getContext(req)));
});

export const startCheckout = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = parse(orderIdParams, req.params);
  res.status(201).json(await payments.startCheckout(getContext(req), orderId));
});

export const confirmCheckout = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(confirmCheckoutSchema, req.body);
  res.json(await payments.confirmCheckout(getContext(req), input));
});

export const razorpayWebhook = asyncHandler(async (req: Request, res: Response) => {
  if (!req.restaurantId) throw new HttpError(400, "Unknown restaurant");
  res.json(
    await payments.handleWebhook(req.restaurantId, req.rawBody, req.headers["x-razorpay-signature"], req.body ?? {})
  );
});
