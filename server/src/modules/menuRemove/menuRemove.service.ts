import { Types } from "mongoose";

import { RequestContext } from "../../core/context";
import { withTransaction } from "../../core/transaction";
import { writeAudit } from "../../utils/audit";
import { HttpError } from "../../utils/httpError";
import { clearRecommendationCache } from "../recommendations/recommendations.service";
import { MenuRemoveRepository } from "./menuRemove.repository";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function names(list: { name: string }[]) {
  const shown = list.slice(0, 3).map((d) => d.name);
  return shown.join(", ") + (list.length > 3 ? ` and ${list.length - 3} more` : "");
}

/** Refuses when a dish that stays on the menu is a combo that includes one of the dishes being removed. */
async function assertNotInCombo(repo: MenuRemoveRepository, ids: Types.ObjectId[]) {
  const combos = await repo.combosUsing(ids);
  if (combos.length > 0) {
    throw new HttpError(409, `It is part of the combo ${names(combos)}. Take it out of the combo first.`);
  }
}

/** Past orders keep the dish's name and price on each line, so removing a dish never changes old bills or reports. */
export async function removeFoodItem(ctx: RequestContext, id: string) {
  const repo = new MenuRemoveRepository(ctx.restaurantId);
  const dish = await repo.findFood(id);
  if (!dish) throw new HttpError(404, "Dish not found");
  await assertNotInCombo(repo, [dish._id]);
  await withTransaction((session) => repo.deleteFoods([dish._id], session));
  clearRecommendationCache(ctx.restaurantId);
  await writeAudit(ctx, "foodItem.delete", `Removed dish ${dish.name}`);
  return { message: "Dish removed" };
}

/** Removes a subcategory and the switched-off dishes in it. A subcategory with a dish still on cannot be removed. */
export async function removeSubcategory(ctx: RequestContext, id: string) {
  const repo = new MenuRemoveRepository(ctx.restaurantId);
  const subcategory = await repo.findSubcategory(id);
  if (!subcategory) throw new HttpError(404, "Subcategory not found");

  const dishes = await repo.dishesIn({ subcategoryId: subcategory._id });
  const active = dishes.filter((d) => d.isActive);
  if (active.length > 0) {
    throw new HttpError(
      409,
      `${plural(active.length, "dish is", "dishes are")} still on in this subcategory (${names(active)}). Switch ${active.length === 1 ? "it" : "them"} off or move ${active.length === 1 ? "it" : "them"} first.`
    );
  }
  const ids = dishes.map((d) => d._id);
  await assertNotInCombo(repo, ids);
  await withTransaction(async (session) => {
    await repo.deleteFoods(ids, session);
    await repo.deleteSubcategories([subcategory._id], session);
  });
  clearRecommendationCache(ctx.restaurantId);
  await writeAudit(ctx, "subcategory.delete", `Removed subcategory ${subcategory.name} and ${plural(ids.length, "hidden dish", "hidden dishes")}`);
  return { message: "Subcategory removed", removedDishes: ids.length };
}

/** Removes a category, its subcategories and its switched-off dishes. A category with a dish still on cannot be removed. */
export async function removeCategory(ctx: RequestContext, id: string) {
  const repo = new MenuRemoveRepository(ctx.restaurantId);
  const category = await repo.findCategory(id);
  if (!category) throw new HttpError(404, "Category not found");

  const dishes = await repo.dishesIn({ categoryId: category._id });
  const active = dishes.filter((d) => d.isActive);
  if (active.length > 0) {
    throw new HttpError(
      409,
      `${plural(active.length, "dish is", "dishes are")} still on in this category (${names(active)}). Switch ${active.length === 1 ? "it" : "them"} off or move ${active.length === 1 ? "it" : "them"} first.`
    );
  }
  const ids = dishes.map((d) => d._id);
  await assertNotInCombo(repo, ids);
  const subcategories = await repo.subcategoryIdsOf(category._id);
  await withTransaction(async (session) => {
    await repo.deleteFoods(ids, session);
    await repo.deleteSubcategories(
      subcategories.map((s) => s._id),
      session
    );
    await repo.deleteCategory(category._id, session);
  });
  clearRecommendationCache(ctx.restaurantId);
  await writeAudit(
    ctx,
    "category.delete",
    `Removed category ${category.name}, ${plural(subcategories.length, "subcategory", "subcategories")} and ${plural(ids.length, "hidden dish", "hidden dishes")}`
  );
  return { message: "Category removed", removedSubcategories: subcategories.length, removedDishes: ids.length };
}
