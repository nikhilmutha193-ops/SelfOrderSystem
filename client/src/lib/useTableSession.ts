import { decodeToken, getStoredToken } from "../shared/api/client";

interface TablePayload {
  role: "table";
  restaurantId: string;
  id: string;
  tableId?: string;
  orderId?: string;
  via?: "qr" | "code";
}

export function useTableSession() {
  const token = getStoredToken("table");
  const payload = token ? decodeToken<TablePayload>(token) : null;
  return { token, tableId: payload?.tableId, orderId: payload?.orderId, via: payload?.via };
}
