import { Router } from "express";

import { requireAuth, requireModule } from "../../middleware/auth";
import {
  createCount,
  createPurchase,
  createStockItem,
  createVendor,
  deleteStockItem,
  getSettings,
  itemLedger,
  listCounts,
  listPurchases,
  listRecipes,
  listStock,
  listVendors,
  postMovement,
  saveRecipe,
  updateSettings,
  updateStockItem,
  updateVendor,
  usageReport,
} from "./inventory.controller";

const router = Router();

router.use(requireAuth("admin"), requireModule("inventory"));
router.get("/items", listStock);
router.post("/items", createStockItem);
router.put("/items/:id", updateStockItem);
router.delete("/items/:id", deleteStockItem);
router.get("/items/:id/movements", itemLedger);
router.post("/movements", postMovement);
router.get("/recipes", listRecipes);
router.put("/recipes/:foodItemId", saveRecipe);
router.get("/vendors", listVendors);
router.post("/vendors", createVendor);
router.put("/vendors/:id", updateVendor);
router.get("/purchases", listPurchases);
router.post("/purchases", createPurchase);
router.get("/counts", listCounts);
router.post("/counts", createCount);
router.get("/reports/usage", usageReport);
router.get("/settings", getSettings);
router.put("/settings", updateSettings);

export default router;
