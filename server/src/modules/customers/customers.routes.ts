import { Router } from "express";

import { requireAuth, requireModule } from "../../middleware/auth";
import {
  attach,
  getSettings,
  listCustomers,
  lookup,
  orderCustomer,
  profile,
  publicBill,
  publicBillPdf,
  redeem,
  removeRedemption,
  saveSettings,
  shareBill,
  update,
} from "./customers.controller";

export const customerRoutes = Router();

customerRoutes.use(requireAuth("admin"));
customerRoutes.get("/lookup", requireModule("orders"), lookup);
customerRoutes.get("/orders/:orderId", requireModule("orders"), orderCustomer);
customerRoutes.post("/orders/:orderId/attach", requireModule("orders"), attach);
customerRoutes.post("/orders/:orderId/redeem", requireModule("orders"), redeem);
customerRoutes.delete("/orders/:orderId/redeem", requireModule("orders"), removeRedemption);
customerRoutes.get("/settings", requireModule("customers"), getSettings);
customerRoutes.put("/settings", requireModule("customers"), saveSettings);
customerRoutes.get("/", requireModule("customers"), listCustomers);
customerRoutes.get("/:id", requireModule("customers"), profile);
customerRoutes.put("/:id", requireModule("customers"), update);

export const billRoutes = Router();

billRoutes.get("/public/:token", publicBill);
billRoutes.get("/public/:token/pdf", publicBillPdf);
billRoutes.post("/:orderId/share", requireAuth("admin"), requireModule("orders"), shareBill);
