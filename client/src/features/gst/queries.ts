import { useQuery } from "@tanstack/react-query";

import { gstApi } from "./api";

export function useGstReport(from: string, to: string) {
  return useQuery({
    queryKey: ["gst", "report", from, to],
    queryFn: () => gstApi.report(from, to),
    enabled: !!from && !!to && from <= to,
  });
}
