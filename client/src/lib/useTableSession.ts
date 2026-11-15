import { decodeToken, getStoredToken } from "../shared/api/client";

interface TablePayload {
  role: "table";
  restaurantId: string;
  id: string;
  tableId?: string;
  orderId?: string;
  sessionId?: string;
  via?: "qr" | "code" | "token";
}

export function useTableSession() {
  const token = getStoredToken("table");
  const payload = token ? decodeToken<TablePayload>(token) : null;
  return { token, tableId: payload?.tableId, orderId: payload?.orderId, sessionId: payload?.sessionId, via: payload?.via };
}
