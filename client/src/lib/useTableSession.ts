import { decodeToken, getStoredToken } from "./apiClient";

interface TablePayload {
  role: "table";
  restaurantId: string;
  id: string;
  tableId?: string;
  orderId?: string;
}

export function useTableSession() {
  const token = getStoredToken("table");
  const payload = token ? decodeToken<TablePayload>(token) : null;
  return { token, tableId: payload?.tableId, orderId: payload?.orderId };
}
