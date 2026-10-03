import type { MenuRecommendations } from "./types";

export function suggestionsFor(recs: MenuRecommendations | null | undefined, inCart: string[], limit = 4): string[] {
  if (!recs || inCart.length === 0) return [];
  const exclude = new Set(inCart);
  const score = new Map<string, number>();
  for (const id of new Set(inCart)) {
    const pairs = recs.pairs[id] ?? [];
    pairs.forEach((other, index) => {
      if (exclude.has(other)) return;
      score.set(other, (score.get(other) ?? 0) + (pairs.length - index));
    });
  }
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}
