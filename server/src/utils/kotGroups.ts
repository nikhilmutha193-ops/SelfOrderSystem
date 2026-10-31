/** Categories printed together on one KOT ticket. Every other category gets a ticket of its own. */
export interface KotCategoryGroup {
  categoryIds: { toString(): string }[];
}

interface CategorisedItem {
  categoryId?: { toString(): string } | null;
  categoryName?: string | null;
}

/**
 * The ticket an item belongs to when the KOT is split by category: the group its category was merged into, else
 * its own category. Items without a category share one "Other" ticket.
 */
export function kotTicketKey(item: CategorisedItem, groups: KotCategoryGroup[] | undefined): string {
  const id = item.categoryId?.toString();
  if (id) {
    const index = (groups ?? []).findIndex((g) => g.categoryIds.some((c) => c.toString() === id));
    if (index >= 0) return `group:${index}`;
    return `category:${id}`;
  }
  return `name:${item.categoryName ?? ""}`;
}

/** What the ticket is headed with: its categories' names, joined when several were merged. */
export function kotTicketLabel(items: CategorisedItem[]): string {
  const names: string[] = [];
  for (const item of items) {
    const name = item.categoryName || "Other";
    if (!names.includes(name)) names.push(name);
  }
  return names.join(" + ");
}
