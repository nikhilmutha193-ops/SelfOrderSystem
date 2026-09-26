import { Router } from "express";

import { requireAuth, requireModule } from "../../middleware/auth";
import {
  addOrderItems,
  applyCoupon,
  archiveOrders,
  cancelOrder,
  cancelOrderItem,
  exportOrdersCsv,
  exportOrdersPdf,
  generateBill,
  getInvoice,
  getInvoicePdf,
  getOrder,
  listInvoiceRegister,
  listOrderCoupons,
  listOrders,
  payOrder,
  removeCoupon,
  reopenBill,
  startCounterOrder,
  startDeliveryOrder,
  startDineInOrder,
  startTakeawayOrder,
  voidBill,
} from "./orders.controller";

const router = Router();

router.post("/dine-in", requireAuth("table"), requireModule("orders"), startDineInOrder);
router.post("/delivery", requireAuth("admin"), requireModule("orders"), startDeliveryOrder);
router.post("/counter", requireAuth("admin"), requireModule("orders"), startCounterOrder);
router.post("/takeaway", requireAuth("admin"), requireModule("orders"), startTakeawayOrder);

router.get("/", requireAuth("admin"), requireModule("orders"), listOrders);
router.delete("/", requireAuth("admin"), requireModule("orders"), archiveOrders);
router.get("/invoices", requireAuth("admin"), requireModule("orders"), listInvoiceRegister);
router.get("/report.csv", requireAuth("admin"), requireModule("orders"), exportOrdersCsv);
router.get("/report.pdf", requireAuth("admin"), requireModule("orders"), exportOrdersPdf);

router.get("/:orderId", requireAuth("table", "admin", "chef"), requireModule("orders"), getOrder);
router.get("/:orderId/invoice", requireAuth("table", "admin"), requireModule("orders"), getInvoice);
router.get("/:orderId/invoice/pdf", requireAuth("table", "admin"), requireModule("orders"), getInvoicePdf);
router.post("/:orderId/bill", requireAuth("admin"), requireModule("orders"), generateBill);
router.post("/:orderId/reopen", requireAuth("admin"), requireModule("orders"), reopenBill);
router.post("/:orderId/void", requireAuth("admin"), requireModule("orders"), voidBill);
router.patch("/:orderId/pay", requireAuth("admin"), requireModule("orders"), payOrder);
router.patch("/:orderId/cancel", requireAuth("admin"), requireModule("orders"), cancelOrder);

router.post("/:orderId/items", requireAuth("table", "admin"), requireModule("orders"), addOrderItems);
router.patch("/items/:itemId/cancel", requireAuth("admin"), requireModule("orders"), cancelOrderItem);

router.get("/:orderId/coupons", requireAuth("table", "admin"), requireModule("orders"), listOrderCoupons);
router.post("/:orderId/coupon", requireAuth("table", "admin"), requireModule("orders"), applyCoupon);
router.delete("/:orderId/coupon", requireAuth("table", "admin"), requireModule("orders"), removeCoupon);

export default router;
