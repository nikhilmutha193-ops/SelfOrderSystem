import { RequestContext } from "../../core/context";
import { moderateMessage } from "../../utils/chatModeration";
import { HttpError } from "../../utils/httpError";
import { getOwnedOrder } from "../orders/orders.service";
import { ChatRepository } from "./chat.repository";

const CONVERSATION_LIMIT = 50;

export async function listActiveChats(ctx: RequestContext) {
  const repo = new ChatRepository(ctx.restaurantId);
  const grouped = await repo.latestConversations(CONVERSATION_LIMIT);
  const orders = await repo.findOrdersWithTable(grouped.map((g) => g._id));
  const orderById = new Map(orders.map((o) => [o._id.toString(), o]));

  return grouped
    .filter((g) => orderById.has(g._id.toString()))
    .map((g) => ({
      orderId: g._id,
      order: orderById.get(g._id.toString()),
      lastMessage: g.lastMessage,
      lastSenderRole: g.lastSenderRole,
      lastAt: g.lastAt,
      unreadCount: g.unreadCount,
    }));
}

export async function getChatMessages(ctx: RequestContext, orderId: string) {
  const order = await getOwnedOrder(ctx, orderId);
  const repo = new ChatRepository(ctx.restaurantId);
  const messages = await repo.findMessages(order._id);

  const role = ctx.auth.role;
  if (role === "admin" || role === "table") await repo.markReadBy(order._id, role);

  return messages;
}

export async function sendChatMessage(ctx: RequestContext, orderId: string, message: string) {
  const order = await getOwnedOrder(ctx, orderId);

  const role = ctx.auth.role;
  if (role !== "admin" && role !== "table") throw new HttpError(403, "Only table and admin can send chat messages");

  const repo = new ChatRepository(ctx.restaurantId);
  const restaurant = await repo.findModerationSettings();
  const moderation = restaurant?.chatModeration ?? { enabled: true, mode: "mask" as const, customWords: [] };
  const { clean, flagged } = moderateMessage(message, moderation);
  if (flagged && moderation.mode === "block") {
    throw new HttpError(400, "Your message contains language that isn't allowed. Please rephrase and try again.");
  }

  return repo.createMessage({
    orderId: order._id,
    senderRole: role,
    senderName: role === "admin" ? "Restaurant" : order.customerName || "Guest",
    message: clean,
    flagged,
    readByAdmin: role === "admin",
    readByTable: role === "table",
  });
}

export async function deleteChatMessage(ctx: RequestContext, messageId: string) {
  const repo = new ChatRepository(ctx.restaurantId);
  const message = await repo.findMessage(messageId);
  if (!message) throw new HttpError(404, "Message not found");
  await repo.deleteMessage(message._id);
  return { message: "Message deleted" };
}

export async function markAllChatsRead(ctx: RequestContext) {
  const result = await new ChatRepository(ctx.restaurantId).markAllReadByAdmin();
  return { message: "All messages marked as read", updated: result.modifiedCount };
}
