import type { FoodItem } from "../../lib/types";

interface DishCount {
  on: number;
  off: number;
}

/** "3 on, 2 hidden" or "No dishes", for the Dishes column. */
export function dishCountLabel(count: DishCount | undefined) {
  if (!count || count.on + count.off === 0) return "No dishes";
  return [count.on > 0 && `${count.on} on`, count.off > 0 && `${count.off} hidden`].filter(Boolean).join(", ");
}

/** Dish counts by category id and by subcategory id, from the dish list. */
export function countDishes(foods: FoodItem[]) {
  const byCategory = new Map<string, DishCount>();
  const bySubcategory = new Map<string, DishCount>();
  const add = (map: Map<string, DishCount>, id: string, isActive: boolean) => {
    const count = map.get(id) ?? { on: 0, off: 0 };
    if (isActive) count.on += 1;
    else count.off += 1;
    map.set(id, count);
  };
  for (const food of foods) {
    add(byCategory, food.categoryId, food.isActive);
    add(bySubcategory, food.subcategoryId, food.isActive);
  }
  return { byCategory, bySubcategory };
}
