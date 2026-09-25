import { Request, Response } from "express";

import { getContext } from "../../core/context";
import { parse } from "../../core/validate";
import { asyncHandler } from "../../middleware/errorHandler";
import { orderIdParams } from "../orders/orders.schema";
import { messageIdParams, sendMessageSchema } from "./chat.schema";
import * as chatService from "./chat.service";

export const listActiveChats = asyncHandler(async (req: Request, res: Response) => {
  res.json(await chatService.listActiveChats(getContext(req)));
});

export const getChatMessages = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = parse(orderIdParams, req.params);
  res.json(await chatService.getChatMessages(getContext(req), orderId));
});

export const sendChatMessage = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = parse(orderIdParams, req.params);
  const { message } = parse(sendMessageSchema, req.body);
  res.status(201).json(await chatService.sendChatMessage(getContext(req), orderId, message));
});

export const deleteChatMessage = asyncHandler(async (req: Request, res: Response) => {
  const { messageId } = parse(messageIdParams, req.params);
  res.json(await chatService.deleteChatMessage(getContext(req), messageId));
});

export const markAllChatsRead = asyncHandler(async (req: Request, res: Response) => {
  res.json(await chatService.markAllChatsRead(getContext(req)));
});
