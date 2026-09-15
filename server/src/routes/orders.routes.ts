import { Router } from "express";
import {
  startDineInOrder,
  startDeliveryOrder,
  addOrderItems,
  startPreparingItem,
  markItemReady,
  serveOrderItem,
  cancelOrderItem,
  listOrders,
  getOrder,
  getInvoice,
  getInvoicePdf,
  payOrder,
  cancelOrder,
  getKotQueue,
  printKot,
  getKotPdf,
  applyCoupon,
  removeCoupon,
  listActiveChats,
  getChatMessages,
  sendChatMessage,
} from "../controllers/orders.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.post("/dine-in", requireAuth("table"), startDineInOrder);
router.post("/delivery", requireAuth("admin"), startDeliveryOrder);

router.get("/", requireAuth("admin"), listOrders);
router.get("/chat/active", requireAuth("admin"), listActiveChats);
router.get("/:orderId", requireAuth("table", "admin", "chef"), getOrder);
router.get("/:orderId/invoice", requireAuth("table", "admin"), getInvoice);
router.get("/:orderId/invoice/pdf", requireAuth("table", "admin"), getInvoicePdf);
router.patch("/:orderId/pay", requireAuth("admin"), payOrder);
router.patch("/:orderId/cancel", requireAuth("admin"), cancelOrder);

router.post("/:orderId/items", requireAuth("table", "admin"), addOrderItems);

router.post("/:orderId/coupon", requireAuth("table", "admin"), applyCoupon);
router.delete("/:orderId/coupon", requireAuth("table", "admin"), removeCoupon);

router.get("/:orderId/chat", requireAuth("table", "admin"), getChatMessages);
router.post("/:orderId/chat", requireAuth("table", "admin"), sendChatMessage);

router.get("/kot/queue", requireAuth("chef", "admin"), getKotQueue);
router.post("/:orderId/kot/print", requireAuth("chef", "admin"), printKot);
router.get("/:orderId/kot/:round/pdf", requireAuth("chef", "admin"), getKotPdf);

router.patch("/items/:itemId/preparing", requireAuth("chef", "admin"), startPreparingItem);
router.patch("/items/:itemId/ready", requireAuth("chef", "admin"), markItemReady);
router.patch("/items/:itemId/serve", requireAuth("chef", "admin"), serveOrderItem);
router.patch("/items/:itemId/cancel", requireAuth("admin"), cancelOrderItem);

export default router;
