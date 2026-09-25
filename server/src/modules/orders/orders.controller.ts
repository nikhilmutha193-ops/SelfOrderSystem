import { Request, Response } from "express";

import { getContext } from "../../core/context";
import { parse } from "../../core/validate";
import { asyncHandler } from "../../middleware/errorHandler";
import { streamInvoicePdf, streamOrdersReportPdf } from "../../utils/pdf";
import { buildOrdersCsv, buildOrdersPdfData, reportFilename } from "./orders.report";
import {
  addItemsSchema,
  applyCouponSchema,
  itemIdParams,
  orderFilterQuery,
  orderIdParams,
  payOrderSchema,
  startCounterSchema,
  startDeliverySchema,
  startDineInSchema,
  startTakeawaySchema,
} from "./orders.schema";
import * as ordersService from "./orders.service";

export const startDineInOrder = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(startDineInSchema, req.body);
  res.status(201).json(await ordersService.startDineInOrder(getContext(req), input));
});

export const startDeliveryOrder = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(startDeliverySchema, req.body);
  res.status(201).json(await ordersService.startDeliveryOrder(getContext(req), input));
});

export const startTakeawayOrder = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(startTakeawaySchema, req.body);
  res.status(201).json(await ordersService.startTakeawayOrder(getContext(req), input));
});

export const startCounterOrder = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(startCounterSchema, req.body);
  res.status(201).json(await ordersService.startCounterOrder(getContext(req), input));
});

export const addOrderItems = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = parse(orderIdParams, req.params);
  const input = parse(addItemsSchema, req.body);
  res.status(201).json(await ordersService.addOrderItems(getContext(req), orderId, input));
});

export const cancelOrderItem = asyncHandler(async (req: Request, res: Response) => {
  const { itemId } = parse(itemIdParams, req.params);
  res.json(await ordersService.cancelOrderItem(getContext(req), itemId));
});

export const listOrders = asyncHandler(async (req: Request, res: Response) => {
  const query = parse(orderFilterQuery, req.query);
  res.json(await ordersService.listOrders(getContext(req), query));
});

export const clearOrders = asyncHandler(async (req: Request, res: Response) => {
  const query = parse(orderFilterQuery, req.query);
  res.json(await ordersService.clearOrders(getContext(req), query));
});

export const exportOrdersCsv = asyncHandler(async (req: Request, res: Response) => {
  const query = parse(orderFilterQuery, req.query);
  const csv = await buildOrdersCsv(getContext(req), query);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${reportFilename(query, "csv")}"`);
  res.send(csv);
});

export const exportOrdersPdf = asyncHandler(async (req: Request, res: Response) => {
  const query = parse(orderFilterQuery, req.query);
  await streamOrdersReportPdf(res, await buildOrdersPdfData(getContext(req), query));
});

export const getOrder = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = parse(orderIdParams, req.params);
  res.json(await ordersService.getOrder(getContext(req), orderId));
});

export const getInvoice = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = parse(orderIdParams, req.params);
  res.json(await ordersService.getInvoice(getContext(req), orderId));
});

export const getInvoicePdf = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = parse(orderIdParams, req.params);
  await streamInvoicePdf(res, await ordersService.getInvoicePdfData(getContext(req), orderId));
});

export const listOrderCoupons = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = parse(orderIdParams, req.params);
  res.json(await ordersService.listOrderCoupons(getContext(req), orderId));
});

export const applyCoupon = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = parse(orderIdParams, req.params);
  const { code } = parse(applyCouponSchema, req.body);
  res.json(await ordersService.applyCoupon(getContext(req), orderId, code));
});

export const removeCoupon = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = parse(orderIdParams, req.params);
  res.json(await ordersService.removeCoupon(getContext(req), orderId));
});

export const payOrder = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = parse(orderIdParams, req.params);
  const input = parse(payOrderSchema, req.body);
  res.json(await ordersService.payOrder(getContext(req), orderId, input));
});

export const cancelOrder = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = parse(orderIdParams, req.params);
  res.json(await ordersService.cancelOrder(getContext(req), orderId));
});
