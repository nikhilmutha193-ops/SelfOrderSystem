import { Request, Response } from "express";
import { Types } from "mongoose";

import { asyncHandler } from "../middleware/errorHandler";
import Category from "../models/Category";
import FoodItem from "../models/FoodItem";
import { HttpError } from "../utils/httpError";
import { writeAudit } from "../utils/audit";

/** Every active dish with whether it is on the landing page, for the switches under Landing page > Menu highlights. */
export const listLandingMenu = asyncHandler(async (req: Request, res: Response) => {
  const [dishes, categories] = await Promise.all([
    FoodItem.find({ restaurantId: req.restaurantId, isActive: true })
      .select("name price imageUrl categoryId isBestseller showOnLanding")
      .sort({ name: 1 })
      .lean(),
    Category.find({ restaurantId: req.restaurantId }).select("name").lean(),
  ]);
  const categoryName = new Map(categories.map((c) => [c._id.toString(), c.name]));
  res.json(
    dishes.map((d) => ({
      _id: d._id,
      name: d.name,
      price: d.price,
      imageUrl: d.imageUrl ?? "",
      categoryName: categoryName.get(d.categoryId.toString()) ?? "",
      shown: d.showOnLanding ?? !!d.isBestseller,
    }))
  );
});

/** Show or hide one dish on the landing page. */
export const setLandingMenuItem = asyncHandler(async (req: Request, res: Response) => {
  if (!Types.ObjectId.isValid(req.params.id)) throw new HttpError(400, "Invalid id");
  const { show } = req.body as { show?: unknown };
  if (typeof show !== "boolean") throw new HttpError(400, "Choose whether to show this dish");
  const dish = await FoodItem.findOneAndUpdate(
    { _id: req.params.id, restaurantId: req.restaurantId },
    { $set: { showOnLanding: show } },
    { new: true }
  ).select("name");
  if (!dish) throw new HttpError(404, "Dish not found");
  await writeAudit(req, "landing.menuItem", `${show ? "Showed" : "Hid"} "${dish.name}" on the landing page`);
  res.json({ _id: dish._id, shown: show });
});
