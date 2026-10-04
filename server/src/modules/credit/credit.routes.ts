import { Router } from "express";

import { requireAuth, requireModule } from "../../middleware/auth";
import { getCustomerCredit, getDues, postCreditPayment, putCreditLimit } from "./credit.controller";

const creditRoutes = Router();

creditRoutes.get("/dues", requireAuth("admin"), requireModule("customers"), getDues);
creditRoutes.get("/customers/:id", requireAuth("admin"), requireModule("orders"), getCustomerCredit);
creditRoutes.put("/customers/:id/limit", requireAuth("admin"), requireModule("customers"), putCreditLimit);
creditRoutes.post("/customers/:id/payments", requireAuth("admin"), requireModule("orders"), postCreditPayment);

export default creditRoutes;
