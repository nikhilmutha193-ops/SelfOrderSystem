import { RequestContext } from "../../core/context";
import { MenuEngineeringRepository } from "./menuEngineering.repository";

export type DishClass = "star" | "workhorse" | "puzzle" | "dog" | "unknown";

export interface DishInsight {
  foodItemId: string;
  name: string;
  category: string;
  isActive: boolean;
  quantity: number;
  revenue: number;
  avgPrice: number;
  cost: number | null;
  margin: number | null;
  marginPercent: number | null;
  totalMargin: number | null;
  mixPercent: number;
  popular: boolean;
  profitable: boolean | null;
  class: DishClass;
}

const POPULARITY_FACTOR = 0.7;

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function classify(dishes: Omit<DishInsight, "mixPercent" | "popular" | "profitable" | "class">[]) {
  const totalQty = dishes.reduce((sum, d) => sum + d.quantity, 0);
  const popularityMix = dishes.length > 0 ? (POPULARITY_FACTOR / dishes.length) * 100 : 0;

  const costed = dishes.filter((d) => d.margin != null);
  const costedQty = costed.reduce((sum, d) => sum + d.quantity, 0);
  const avgMargin =
    costed.length === 0
      ? null
      : costedQty > 0
        ? costed.reduce((sum, d) => sum + d.margin! * d.quantity, 0) / costedQty
        : costed.reduce((sum, d) => sum + d.margin!, 0) / costed.length;

  const result: DishInsight[] = dishes.map((d) => {
    const mixPercent = totalQty > 0 ? (d.quantity / totalQty) * 100 : 0;
    const popular = totalQty > 0 && mixPercent >= popularityMix;
    const profitable = d.margin == null || avgMargin == null ? null : d.margin >= avgMargin;
    const cls: DishClass =
      profitable == null ? "unknown" : popular ? (profitable ? "star" : "workhorse") : profitable ? "puzzle" : "dog";
    return { ...d, mixPercent: round2(mixPercent), popular, profitable, class: cls };
  });

  return {
    dishes: result,
    thresholds: { popularityMixPercent: round2(popularityMix), avgMargin: avgMargin == null ? null : round2(avgMargin) },
    totalQty,
  };
}

export async function menuEngineering(ctx: RequestContext, days: number) {
  const repo = new MenuEngineeringRepository(ctx.restaurantId);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [orders, foods, categories, recipes, stock] = await Promise.all([
    repo.paidOrderIdsSince(since),
    repo.foods(),
    repo.categories(),
    repo.recipes(),
    repo.stockItems(),
  ]);
  const items = orders.length ? await repo.soldItems(orders.map((o) => o._id)) : [];

  const categoryName = new Map(categories.map((c) => [c._id.toString(), c.name]));
  const avgCost = new Map(stock.map((s) => [s._id.toString(), s.avgCost ?? 0]));
  const recipeOf = new Map(recipes.map((r) => [r.foodItemId.toString(), r]));

  const comboOf = new Map(foods.map((f) => [f._id.toString(), f.comboItems ?? []]));
  const recipeCost = (foodId: string): number | null => {
    const recipe = recipeOf.get(foodId);
    if (!recipe) return null;
    return recipe.lines.reduce((sum, line) => sum + line.quantity * (avgCost.get(line.stockItemId.toString()) ?? 0), 0);
  };
  const dishCost = (foodId: string): number | null => {
    const own = recipeCost(foodId);
    if (own != null) return round2(own);
    const parts = comboOf.get(foodId) ?? [];
    if (parts.length === 0) return null;
    let total = 0;
    for (const part of parts) {
      const partCost = recipeCost(part.foodItemId.toString());
      if (partCost == null) return null;
      total += partCost * part.quantity;
    }
    return round2(total);
  };

  const sales = new Map<string, { qty: number; paidQty: number; revenue: number }>();
  for (const item of items) {
    if (!item.foodItemId) continue;
    const key = item.foodItemId.toString();
    const entry = sales.get(key) ?? { qty: 0, paidQty: 0, revenue: 0 };
    entry.qty += item.quantity;
    if (!item.complimentary) {
      entry.paidQty += item.quantity;
      entry.revenue += item.total;
    }
    sales.set(key, entry);
  }

  const dishes = foods
    .filter((food) => food.isActive || sales.has(food._id.toString()))
    .map((food) => {
      const key = food._id.toString();
      const sold = sales.get(key) ?? { qty: 0, paidQty: 0, revenue: 0 };
      const cost = dishCost(key);
      const avgPrice = sold.paidQty > 0 ? round2(sold.revenue / sold.paidQty) : food.price;
      const margin = cost == null ? null : round2(avgPrice - cost);
      return {
        foodItemId: key,
        name: food.name,
        category: categoryName.get(food.categoryId.toString()) ?? "",
        isActive: food.isActive,
        quantity: sold.qty,
        revenue: round2(sold.revenue),
        avgPrice,
        cost,
        margin,
        marginPercent: margin == null || avgPrice <= 0 ? null : round2((margin / avgPrice) * 100),
        totalMargin: margin == null ? null : round2(margin * sold.paidQty),
      };
    });

  const { dishes: classified, thresholds, totalQty } = classify(dishes);
  const counts = { star: 0, workhorse: 0, puzzle: 0, dog: 0, unknown: 0 };
  for (const d of classified) counts[d.class] += 1;

  return {
    days,
    since: since.toISOString(),
    totals: {
      quantity: totalQty,
      revenue: round2(classified.reduce((sum, d) => sum + d.revenue, 0)),
      margin: round2(classified.reduce((sum, d) => sum + (d.totalMargin ?? 0), 0)),
      dishesWithoutRecipe: counts.unknown,
    },
    thresholds,
    counts,
    dishes: classified.sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name)),
  };
}
