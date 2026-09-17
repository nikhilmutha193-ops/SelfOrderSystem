import { Router } from "express";
import {
  startDineInOrder,
  startDeliveryOrder,
  startCounterOrder,
  startTakeawayOrder,
  addOrderItems,
  startPreparingItem,
  markItemReady,
  serveOrderItem,
  cancelOrderItem,
  listOrders,
  exportOrdersCsv,
  exportOrdersPdf,
  getOrder,
  getInvoice,
  getInvoicePdf,
  payOrder,
  cancelOrder,
  getKotQueue,
  printKot,
  getKotPdf,
  applyCoupon,
  listOrderCoupons,
  removeCoupon,
  listActiveChats,
  getChatMessages,
  sendChatMessage,
  deleteChatMessage,
  markAllChatsRead,
} from "../controllers/orders.controller";
import { requireAuth, requireModule } from "../middleware/auth";

const router = Router();

router.post("/dine-in", requireAuth("table"), requireModule("orders"), startDineInOrder);
router.post("/delivery", requireAuth("admin"), requireModule("orders"), startDeliveryOrder);
router.post("/counter", requireAuth("admin"), requireModule("orders"), startCounterOrder);
router.post("/takeaway", requireAuth("admin"), requireModule("orders"), startTakeawayOrder);

router.get("/", requireAuth("admin"), requireModule("orders"), listOrders);
// Report exports - declared before "/:orderId" so "report.csv" isn't taken as an order id.
router.get("/report.csv", requireAuth("admin"), requireModule("orders"), exportOrdersCsv);
router.get("/report.pdf", requireAuth("admin"), requireModule("orders"), exportOrdersPdf);
router.get("/chat/active", requireAuth("admin"), requireModule("messages"), listActiveChats);
router.patch("/chat/read-all", requireAuth("admin"), requireModule("messages"), markAllChatsRead);
router.delete("/chat/:messageId", requireAuth("admin"), requireModule("messages"), deleteChatMessage);
router.get("/:orderId", requireAuth("table", "admin", "chef"), requireModule("orders"), getOrder);
router.get("/:orderId/invoice", requireAuth("table", "admin"), requireModule("orders"), getInvoice);
router.get("/:orderId/invoice/pdf", requireAuth("table", "admin"), requireModule("orders"), getInvoicePdf);
router.patch("/:orderId/pay", requireAuth("admin"), requireModule("orders"), payOrder);
router.patch("/:orderId/cancel", requireAuth("admin"), requireModule("orders"), cancelOrder);

router.post("/:orderId/items", requireAuth("table", "admin"), requireModule("orders"), addOrderItems);

router.get("/:orderId/coupons", requireAuth("table", "admin"), requireModule("orders"), listOrderCoupons);
router.post("/:orderId/coupon", requireAuth("table", "admin"), requireModule("orders"), applyCoupon);
router.delete("/:orderId/coupon", requireAuth("table", "admin"), requireModule("orders"), removeCoupon);

router.get("/:orderId/chat", requireAuth("table", "admin"), requireModule("messages"), getChatMessages);
router.post("/:orderId/chat", requireAuth("table", "admin"), requireModule("messages"), sendChatMessage);

router.get("/kot/queue", requireAuth("chef", "admin"), requireModule("kot"), getKotQueue);
router.post("/:orderId/kot/print", requireAuth("chef", "admin"), requireModule("kot"), printKot);
router.get("/:orderId/kot/:round/pdf", requireAuth("chef", "admin"), requireModule("kot"), getKotPdf);

router.patch("/items/:itemId/preparing", requireAuth("chef", "admin"), requireModule("kot"), startPreparingItem);
router.patch("/items/:itemId/ready", requireAuth("chef", "admin"), requireModule("kot"), markItemReady);
router.patch("/items/:itemId/serve", requireAuth("chef", "admin"), requireModule("kot"), serveOrderItem);
router.patch("/items/:itemId/cancel", requireAuth("admin"), requireModule("orders"), cancelOrderItem);

export default router;
