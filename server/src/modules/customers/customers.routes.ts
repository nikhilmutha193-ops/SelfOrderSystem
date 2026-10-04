import { Router } from "express";

import { requireAuth, requireModule } from "../../middleware/auth";
import {
  attach,
  createSmsTemplate,
  deleteSmsTemplate,
  getBirthdaySmsSettings,
  getSettings,
  guestLookup,
  listCustomers,
  listSmsCampaigns,
  listSmsTemplates,
  lookup,
  orderCustomer,
  profile,
  publicBill,
  publicBillPdf,
  redeem,
  removeRedemption,
  saveBirthdaySmsSettings,
  saveSettings,
  sendBirthdaySmsNow,
  sendSmsCampaign,
  shareBill,
  update,
  updateSmsTemplate,
} from "./customers.controller";

export const customerRoutes = Router();

// A guest checking their own details on the table sign-in/menu page - registered before the
// requireAuth("admin") blanket below, which only applies to routes added after it.
customerRoutes.get("/guest-lookup", requireAuth("table"), guestLookup);

customerRoutes.use(requireAuth("admin"));
customerRoutes.get("/lookup", requireModule("orders"), lookup);
customerRoutes.get("/orders/:orderId", requireModule("orders"), orderCustomer);
customerRoutes.post("/orders/:orderId/attach", requireModule("orders"), attach);
customerRoutes.post("/orders/:orderId/redeem", requireModule("orders"), redeem);
customerRoutes.delete("/orders/:orderId/redeem", requireModule("orders"), removeRedemption);
customerRoutes.get("/settings", requireModule("customers"), getSettings);
customerRoutes.put("/settings", requireModule("customers"), saveSettings);
// Registered before "/:id" below, so this is never matched as a customer id.
customerRoutes.get("/birthday-sms-settings", requireModule("customers"), getBirthdaySmsSettings);
customerRoutes.put("/birthday-sms-settings", requireModule("customers"), saveBirthdaySmsSettings);
customerRoutes.post("/birthday-sms-settings/send", requireModule("customers"), sendBirthdaySmsNow);
customerRoutes.get("/sms/templates", requireModule("customers"), listSmsTemplates);
customerRoutes.post("/sms/templates", requireModule("customers"), createSmsTemplate);
customerRoutes.put("/sms/templates/:id", requireModule("customers"), updateSmsTemplate);
customerRoutes.delete("/sms/templates/:id", requireModule("customers"), deleteSmsTemplate);
customerRoutes.get("/sms/campaigns", requireModule("customers"), listSmsCampaigns);
customerRoutes.post("/sms/campaigns", requireModule("customers"), sendSmsCampaign);
customerRoutes.get("/", requireModule("customers"), listCustomers);
customerRoutes.get("/:id", requireModule("customers"), profile);
customerRoutes.put("/:id", requireModule("customers"), update);

export const billRoutes = Router();

billRoutes.get("/public/:token", publicBill);
billRoutes.get("/public/:token/pdf", publicBillPdf);
billRoutes.post("/:orderId/share", requireAuth("admin"), requireModule("orders"), shareBill);
