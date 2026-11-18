import type { TableStatus } from "../models/Table";

/**
 * The status changes staff may make by hand. A table's status mostly follows its orders, so only
 * changes that match what is really on the table are offered:
 *  - Free: can be marked Seated (held for a party that is arriving).
 *  - Seated: can be freed, or marked Waiting to pay when it has an unpaid order (not in the cafe flow).
 *  - Waiting to pay: can be freed, or put back to Seated when it still has an unpaid order.
 * Freeing a table cancels its unsent orders; if cooked food is still unpaid it ends up Waiting to pay.
 * Guest (shared walk-in) tables never change.
 */
export function allowedTableStatuses(
  table: { status: TableStatus; isGuest?: boolean },
  unpaidOrders: number,
  options: { cafe?: boolean } = {}
): TableStatus[] {
  if (table.isGuest) return [];
  switch (table.status) {
    case "available":
      return ["occupied"];
    case "occupied":
      return ["available", ...(unpaidOrders > 0 && !options.cafe ? (["awaiting_payment"] as const) : [])];
    case "awaiting_payment":
      return ["available", ...(unpaidOrders > 0 ? (["occupied"] as const) : [])];
    default:
      return [];
  }
}
