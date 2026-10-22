import type { GstReport } from "../../lib/types";
import { api } from "../../shared/api/client";

export const gstApi = {
  report: (from: string, to: string) =>
    api.get<GstReport>("/gst/report", { params: { from, to } }).then((res) => res.data),
};
