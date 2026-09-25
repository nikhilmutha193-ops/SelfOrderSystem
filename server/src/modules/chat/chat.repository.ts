import { FilterQuery, Types } from "mongoose";

import ChatMessage, { ChatSenderRole, IChatMessage } from "../../models/ChatMessage";
import Order, { IOrder } from "../../models/Order";
import Restaurant from "../../models/Restaurant";

export interface ConversationSummary {
  _id: Types.ObjectId;
  lastMessage: string;
  lastSenderRole: ChatSenderRole;
  lastAt: Date;
  unreadCount: number;
}

export type NewChatMessage = Omit<IChatMessage, "_id" | "restaurantId" | "createdAt" | "updatedAt">;

export class ChatRepository {
  constructor(private readonly restaurantId: string) {}

  private scoped<T>(filter: FilterQuery<T> = {}): FilterQuery<T> {
    return { ...filter, restaurantId: this.restaurantId } as FilterQuery<T>;
  }

  latestConversations(limit: number) {
    return ChatMessage.aggregate<ConversationSummary>([
      { $match: { restaurantId: new Types.ObjectId(this.restaurantId) } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$orderId",
          lastMessage: { $first: "$message" },
          lastSenderRole: { $first: "$senderRole" },
          lastAt: { $first: "$createdAt" },
          unreadCount: {
            $sum: {
              $cond: [{ $and: [{ $eq: ["$senderRole", "table"] }, { $eq: ["$readByAdmin", false] }] }, 1, 0],
            },
          },
        },
      },
      { $sort: { lastAt: -1 } },
      { $limit: limit },
    ]);
  }

  findOrdersWithTable(orderIds: Types.ObjectId[]) {
    return Order.find(this.scoped<IOrder>({ _id: { $in: orderIds } })).populate("tableId", "code");
  }

  findMessages(orderId: Types.ObjectId) {
    return ChatMessage.find(this.scoped<IChatMessage>({ orderId })).sort({ createdAt: 1 });
  }

  markReadBy(orderId: Types.ObjectId, reader: ChatSenderRole) {
    if (reader === "admin") {
      return ChatMessage.updateMany(this.scoped<IChatMessage>({ orderId, senderRole: "table", readByAdmin: false }), {
        $set: { readByAdmin: true },
      });
    }
    return ChatMessage.updateMany(this.scoped<IChatMessage>({ orderId, senderRole: "admin", readByTable: false }), {
      $set: { readByTable: true },
    });
  }

  markAllReadByAdmin() {
    return ChatMessage.updateMany(this.scoped<IChatMessage>({ senderRole: "table", readByAdmin: false }), {
      $set: { readByAdmin: true },
    });
  }

  createMessage(data: NewChatMessage) {
    return ChatMessage.create({ ...data, restaurantId: this.restaurantId });
  }

  findMessage(messageId: string) {
    return ChatMessage.findOne(this.scoped<IChatMessage>({ _id: messageId }));
  }

  deleteMessage(messageId: Types.ObjectId) {
    return ChatMessage.deleteOne(this.scoped<IChatMessage>({ _id: messageId }));
  }

  findModerationSettings() {
    return Restaurant.findById(this.restaurantId).select("chatModeration");
  }
}
