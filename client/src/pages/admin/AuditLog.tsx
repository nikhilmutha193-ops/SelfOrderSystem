import { useEffect, useState } from "react";

import { api, extractErrorMessage } from "../../shared/api/client";
import { Badge, Card, ErrorText, TableWrap } from "../../shared/ui/ui";

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

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-800">Audit Log</h1>
      <p className="-mt-4 text-sm text-slate-500">
        A record of sensitive staff actions — payments, cancellations and bulk clears — newest first.
      </p>
      <ErrorText>{error}</ErrorText>

      <Card>
        {loading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No recorded actions yet.</p>
        ) : (
          <TableWrap>
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="pb-2">When</th>
                  <th className="pb-2">Who</th>
                  <th className="pb-2">Action</th>
                  <th className="pb-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e._id} className="border-t border-slate-100 align-top">
                    <td className="py-1.5 whitespace-nowrap text-slate-500">
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                    <td className="py-1.5 font-medium text-slate-700">{e.actorName}</td>
                    <td className="py-1.5">
                      <Badge tone={ACTION_TONE[e.action] || "gray"}>{e.action}</Badge>
                    </td>
                    <td className="py-1.5 text-slate-700">{e.summary}</td>
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
