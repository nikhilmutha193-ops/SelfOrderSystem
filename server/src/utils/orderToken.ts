/** The kitchen token(s) of an order, for the cafe flow's receipt ("Token 12"), or "" when it has none yet. */
export function orderTokenText(items: { tokenNumber?: number | null; status?: string }[]): string {
  const tokens = [
    ...new Set(items.filter((i) => i.status !== "cancelled" && i.tokenNumber != null).map((i) => i.tokenNumber!)),
  ].sort((a, b) => a - b);
  if (tokens.length === 0) return "";
  return `${tokens.length > 1 ? "Tokens" : "Token"} ${tokens.join(", ")}`;
}
