import { useEffect, useMemo, useState } from "react";

import { api, extractErrorMessage } from "../../shared/api/client";
import { usePageTour, type TourStep } from "../../shared/ui/PageTour";
import { Badge, Card, ErrorText, PageHeader, TableWrap } from "../../shared/ui/ui";

interface AuditEntry {
  _id: string;
  actorName: string;
  action: string;
  summary: string;
  createdAt: string;
}

const ACTION_TONE: Record<string, "gray" | "amber" | "red" | "green"> = {
  "order.pay": "green",
  "order.cancel": "red",
  "order.clear": "red",
  "orderItem.cancel": "amber",
};

export default function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<AuditEntry[]>("/analytics/audit")
      .then((res) => setEntries(res.data))
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const tourSteps: TourStep[] = useMemo(
    () => [
      {
        target: "audit-log",
        title: "Sensitive staff actions",
        description: "Payments, cancellations and bulk clears, newest first, with who did it and when.",
      },
    ],
    []
  );
  usePageTour(tourSteps);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 sm:gap-6">
      <PageHeader
        title="Audit Log"
        description={<>A record of sensitive staff actions — payments, cancellations and bulk clears — newest first.</>}
      />
      <ErrorText>{error}</ErrorText>

      <Card data-tour="audit-log">
        {loading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No recorded actions yet.</p>
        ) : (
          <TableWrap>
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Action</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e._id} className="border-t border-slate-100 align-top">
                    <td className="whitespace-nowrap text-slate-500">{new Date(e.createdAt).toLocaleString()}</td>
                    <td className="font-medium text-slate-700">{e.actorName}</td>
                    <td>
                      <Badge tone={ACTION_TONE[e.action] || "gray"}>{e.action}</Badge>
                    </td>
                    <td className="text-slate-700">{e.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
