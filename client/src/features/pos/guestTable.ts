import type { PosTable } from "../../lib/types";

/**
 * A guest (walk-in) table is never occupied on the server, so its state is worked out from its orders:
 * nothing running = free, every order billed = bill printed, otherwise busy.
 */
export function withGuestState(table: PosTable): PosTable {
  if (!table.isGuest) return table;
  const status =
    table.orders.length === 0
      ? "available"
      : table.orders.every((o) => o.status === "billed")
        ? "awaiting_payment"
        : "occupied";
  const since = table.orders.map((o) => o.createdAt).sort()[0] ?? null;
  return { ...table, status, occupiedAt: since };
}
