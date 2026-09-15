import { Router } from "express";
import {
  listCategories,
  createCategory,
  updateCategory,
  setCategoryActive,
  listSubcategories,
  createSubcategory,
  updateSubcategory,
  setSubcategoryActive,
  listFoodItems,
  createFoodItem,
  updateFoodItem,
  setFoodItemActive,
  getPublicMenu,
} from "../controllers/catalog.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/menu", getPublicMenu);

router.get("/categories", requireAuth("admin", "chef"), listCategories);
router.post("/categories", requireAuth("admin"), createCategory);
router.put("/categories/:id", requireAuth("admin"), updateCategory);
router.patch("/categories/:id/active", requireAuth("admin"), setCategoryActive);

router.get("/subcategories", requireAuth("admin", "chef"), listSubcategories);
router.post("/subcategories", requireAuth("admin"), createSubcategory);
router.put("/subcategories/:id", requireAuth("admin"), updateSubcategory);
router.patch("/subcategories/:id/active", requireAuth("admin"), setSubcategoryActive);

router.get("/food-items", requireAuth("admin", "chef"), listFoodItems);
router.post("/food-items", requireAuth("admin"), createFoodItem);
router.put("/food-items/:id", requireAuth("admin"), updateFoodItem);
router.patch("/food-items/:id/active", requireAuth("admin"), setFoodItemActive);

export default router;
