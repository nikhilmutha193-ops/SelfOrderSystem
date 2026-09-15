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
import { requireAuth, requireModule } from "../middleware/auth";

const router = Router();

router.get("/menu", getPublicMenu);

router.get("/categories", requireAuth("admin", "chef"), requireModule("categories"), listCategories);
router.post("/categories", requireAuth("admin"), requireModule("categories"), createCategory);
router.put("/categories/:id", requireAuth("admin"), requireModule("categories"), updateCategory);
router.patch("/categories/:id/active", requireAuth("admin"), requireModule("categories"), setCategoryActive);

router.get("/subcategories", requireAuth("admin", "chef"), requireModule("subcategories"), listSubcategories);
router.post("/subcategories", requireAuth("admin"), requireModule("subcategories"), createSubcategory);
router.put("/subcategories/:id", requireAuth("admin"), requireModule("subcategories"), updateSubcategory);
router.patch("/subcategories/:id/active", requireAuth("admin"), requireModule("subcategories"), setSubcategoryActive);

router.get("/food-items", requireAuth("admin", "chef"), requireModule("foodItems"), listFoodItems);
router.post("/food-items", requireAuth("admin"), requireModule("foodItems"), createFoodItem);
router.put("/food-items/:id", requireAuth("admin"), requireModule("foodItems"), updateFoodItem);
router.patch("/food-items/:id/active", requireAuth("admin"), requireModule("foodItems"), setFoodItemActive);

export default router;
