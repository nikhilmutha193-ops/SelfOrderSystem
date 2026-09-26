import { Request, Response } from "express";

import { getContext } from "../../core/context";
import { idempotencyKey, runIdempotent } from "../../core/idempotency";
import { parse } from "../../core/validate";
import { asyncHandler } from "../../middleware/errorHandler";
import { streamInvoicePdf, streamOrdersReportPdf } from "../../utils/pdf";
import * as billing from "./orders.billing";
import { buildOrdersCsv, buildOrdersPdfData, listInvoices, reportFilename } from "./orders.report";
import {
  addItemsSchema,
  applyCouponSchema,
  cancelItemSchema,
  cancelOrderSchema,
  generateBillSchema,
  invoiceRegisterQuery,
  itemIdParams,
  orderFilterQuery,
  orderIdParams,
  payOrderSchema,
  reasonSchema,
  startCounterSchema,
  startDeliverySchema,
  startDineInSchema,
  startTakeawaySchema,
} from "./orders.schema";
import * as ordersService from "./orders.service";

function created<T>(req: Request, res: Response, scope: string, work: () => Promise<T>) {
  return runIdempotent(getContext(req), idempotencyKey(req), scope, async () => ({
    status: 201,
    body: await work(),
  })).then((result) => res.status(result.status).json(result.body));
}

export const startDineInOrder = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(startDineInSchema, req.body);
  await created(req, res, "orders.dine-in", () => ordersService.startDineInOrder(getContext(req), input));
});

export const startDeliveryOrder = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(startDeliverySchema, req.body);
  await created(req, res, "orders.delivery", () => ordersService.startDeliveryOrder(getContext(req), input));
});

export const startTakeawayOrder = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(startTakeawaySchema, req.body);
  await created(req, res, "orders.takeaway", () => ordersService.startTakeawayOrder(getContext(req), input));
});

export const startCounterOrder = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(startCounterSchema, req.body);
  await created(req, res, "orders.counter", () => ordersService.startCounterOrder(getContext(req), input));
});

export const addOrderItems = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = parse(orderIdParams, req.params);
  const input = parse(addItemsSchema, req.body);
  await created(req, res, `orders.items.${orderId}`, () =>
    ordersService.addOrderItems(getContext(req), orderId, input)
  );
});

export const cancelOrderItem = asyncHandler(async (req: Request, res: Response) => {
  const { itemId } = parse(itemIdParams, req.params);
  const input = parse(cancelItemSchema, req.body);
  res.json(await ordersService.cancelOrderItem(getContext(req), itemId, input));
});

export const listOrders = asyncHandler(async (req: Request, res: Response) => {
  const query = parse(orderFilterQuery, req.query);
  res.json(await ordersService.listOrders(getContext(req), query));
});

export const archiveOrders = asyncHandler(async (req: Request, res: Response) => {
  const query = parse(orderFilterQuery, req.query);
  res.json(await ordersService.archiveOrders(getContext(req), query));
});

export const listInvoiceRegister = asyncHandler(async (req: Request, res: Response) => {
  const query = parse(invoiceRegisterQuery, req.query);
  res.json(await listInvoices(getContext(req), query));
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

export const generateBill = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = parse(orderIdParams, req.params);
  const input = parse(generateBillSchema, req.body);
  res.json(await billing.generateBill(getContext(req), orderId, input));
});

export const reopenBill = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = parse(orderIdParams, req.params);
  const { reason } = parse(reasonSchema, req.body);
  res.json(await billing.reopenBill(getContext(req), orderId, reason));
});

export const voidBill = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = parse(orderIdParams, req.params);
  const { reason } = parse(reasonSchema, req.body);
  res.json(await billing.voidBill(getContext(req), orderId, reason));
});

export const payOrder = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = parse(orderIdParams, req.params);
  const input = parse(payOrderSchema, req.body);
  res.json(await billing.settleOrder(getContext(req), orderId, input));
});

export const cancelOrder = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = parse(orderIdParams, req.params);
  const { reason } = parse(cancelOrderSchema, req.body);
  res.json(await billing.cancelOrder(getContext(req), orderId, reason));
});
