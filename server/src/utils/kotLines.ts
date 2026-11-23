/** The parts of a line that make it the same plate for the kitchen. */
interface KotLine {
  foodName: string;
  quantity: number;
  modifiers?: { label: string }[];
  note?: string;
  isJain?: boolean;
  isPacked?: boolean;
  complimentary?: boolean;
  total?: number;
}

/**
 * One line per dish on a kitchen ticket: the same dish with the same choices is cooked together, so a paid plate and a
 * complimentary plate (which are separate lines on the bill) print as "2 x Ghee Idli", not as two lines. When the
 * ticket shows prices, a complimentary plate stays on its own line so the amounts still add up.
 */
export function mergeKotLines<T extends KotLine>(items: T[], { keepComplimentary = false } = {}): T[] {
  const merged = new Map<string, T>();
  for (const item of items) {
    const key = [
      item.foodName.trim().toLowerCase(),
      (item.modifiers ?? []).map((m) => m.label).join("+"),
      (item.note ?? "").trim().toLowerCase(),
      item.isJain ? "jain" : "",
      item.isPacked ? "pack" : "",
      keepComplimentary && item.complimentary ? "free" : "",
    ].join("|");
    const same = merged.get(key);
    // Items from the database are Mongoose documents, which a plain spread would empty out; copy them as objects.
    const copy = typeof (item as { toObject?: () => T }).toObject === "function" ? (item as unknown as { toObject: () => T }).toObject() : { ...item };
    if (!same) merged.set(key, copy);
    else {
      same.quantity += item.quantity;
      if (same.total !== undefined && item.total !== undefined) same.total += item.total;
    }
  }
  return [...merged.values()];
}
