import { RecommendationsRepository } from "./recommendations.repository";

export interface MenuRecommendations {
  popular: string[];
  pairs: Record<string, string[]>;
}

const POPULAR_DAYS = 14;
const PAIR_DAYS = 60;
const POPULAR_LIMIT = 6;
const PAIR_LIMIT = 4;
const CACHE_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const cache = new Map<string, { at: number; value: MenuRecommendations }>();

export function clearRecommendationCache(restaurantId?: string) {
  if (restaurantId) cache.delete(restaurantId);
  else cache.clear();
}

export function pairCounts(baskets: string[][]): Map<string, Map<string, number>> {
  const counts = new Map<string, Map<string, number>>();
  for (const basket of baskets) {
    const foods = [...new Set(basket)].slice(0, 15);
    for (const a of foods) {
      for (const b of foods) {
        if (a === b) continue;
        const row = counts.get(a) ?? new Map<string, number>();
        row.set(b, (row.get(b) ?? 0) + 1);
        counts.set(a, row);
      }
    }
  }
  return counts;
}

export async function menuRecommendations(restaurantId: string): Promise<MenuRecommendations> {
  const hit = cache.get(restaurantId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const repo = new RecommendationsRepository(restaurantId);
  const foods = await repo.visibleFoods();
  const visible = new Set(foods.map((f) => f._id.toString()));
  const now = Date.now();

  const [popularRows, baskets] = await Promise.all([
    repo.popularSince(
      new Date(now - POPULAR_DAYS * DAY_MS),
      foods.map((f) => f._id)
    ),
    repo.basketsSince(new Date(now - PAIR_DAYS * DAY_MS)),
  ]);

  const popular = popularRows
    .map((r) => r._id.toString())
    .filter((id) => visible.has(id))
    .slice(0, POPULAR_LIMIT);
  if (popular.length === 0) {
    for (const f of foods) if (f.isBestseller && popular.length < POPULAR_LIMIT) popular.push(f._id.toString());
  }

  const counts = pairCounts(baskets.map((b) => b.foods.map((id) => id.toString())));
  const pairs: Record<string, string[]> = {};
  for (const food of foods) {
    const id = food._id.toString();
    const manual = (food.pairsWith ?? []).map((p) => p.toString()).filter((p) => visible.has(p) && p !== id);
    const learned = [...(counts.get(id) ?? new Map<string, number>()).entries()]
      .filter(([other]) => visible.has(other) && !manual.includes(other))
      .sort((a, b) => b[1] - a[1])
      .map(([other]) => other);
    const list = [...manual, ...learned].slice(0, PAIR_LIMIT);
    if (list.length > 0) pairs[id] = list;
  }

  const value = { popular, pairs };
  cache.set(restaurantId, { at: now, value });
  return value;
}
