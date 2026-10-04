import type { Area } from "../../lib/types";
import { api } from "../../shared/api/client";

export const pricingApi = {
  areas: () => api.get<Area[]>("/pricing/areas").then((r) => r.data),
  saveAreas: (areas: { _id?: string; name: string }[]) =>
    api.put<Area[]>("/pricing/areas", { areas }).then((r) => r.data),
  setTableArea: (tableId: string, areaId: string | null) =>
    api.put(`/pricing/tables/${tableId}/area`, { areaId }).then((r) => r.data),
};
