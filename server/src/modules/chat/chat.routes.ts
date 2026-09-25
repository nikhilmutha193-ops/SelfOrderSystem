import { Router } from "express";

import { requireAuth, requireModule } from "../../middleware/auth";
import {
  deleteChatMessage,
  getChatMessages,
  listActiveChats,
  markAllChatsRead,
  sendChatMessage,
} from "./chat.controller";

const router = Router();

router.get("/chat/active", requireAuth("admin"), requireModule("messages"), listActiveChats);
router.patch("/chat/read-all", requireAuth("admin"), requireModule("messages"), markAllChatsRead);
router.delete("/chat/:messageId", requireAuth("admin"), requireModule("messages"), deleteChatMessage);
router.get("/:orderId/chat", requireAuth("table", "admin"), requireModule("messages"), getChatMessages);
router.post("/:orderId/chat", requireAuth("table", "admin"), requireModule("messages"), sendChatMessage);

export default router;
