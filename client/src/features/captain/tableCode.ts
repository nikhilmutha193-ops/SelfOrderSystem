import type { Order } from "../../lib/types";

export function tableCode(order: Pick<Order, "tableId">): string | null {
  return typeof order.tableId === "object" && order.tableId ? order.tableId.code : null;
}
