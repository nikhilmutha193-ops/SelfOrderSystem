import { useState } from "react";

import type { PrintJobStatus } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { Badge, Button, Card, ErrorText, Select, TableWrap } from "../../../shared/ui/ui";
import { usePrintJobs, useRetryJob } from "../queries";

const STATUS_TONE = { queued: "gray", sent: "blue", printed: "green", failed: "red" } as const;
const STATUS_LABEL = { queued: "Waiting", sent: "Printing", printed: "Printed", failed: "Failed" } as const;

export function JobsCard({ canEdit }: { canEdit: boolean }) {
  const [status, setStatus] = useState<PrintJobStatus | "">("");
  const jobs = usePrintJobs(status || undefined);
  const retry = useRetryJob();
  const [error, setError] = useState<string | null>(null);

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Recent print jobs</h2>
        <Select
          id="job-status"
          aria-label="Filter print jobs"
          className="!w-40"
          value={status}
          onChange={(e) => setStatus(e.target.value as PrintJobStatus | "")}
        >
          <option value="">All jobs</option>
          <option value="failed">Failed</option>
          <option value="queued">Waiting</option>
          <option value="printed">Printed</option>
        </Select>
      </div>
      <ErrorText>{error ?? (jobs.error ? extractErrorMessage(jobs.error) : null)}</ErrorText>
      <TableWrap>
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr>
              <th>Time</th>
              <th>Ticket</th>
              <th>Printer</th>
              <th>Status</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {(jobs.data ?? []).map((job) => (
              <tr key={job._id} className="border-t border-slate-100 align-top">
                <td className="whitespace-nowrap">
                  {new Date(job.createdAt).toLocaleTimeString([], { timeStyle: "short" })}
                </td>
                <td>{job.title}</td>
                <td>{job.printerName}</td>
                <td>
                  <Badge tone={STATUS_TONE[job.status]}>{STATUS_LABEL[job.status]}</Badge>
                  {job.lastError && <p className="mt-1 text-xs text-red-600">{job.lastError}</p>}
                </td>
                <td className="text-right">
                  {canEdit && job.status === "failed" && (
                    <Button
                      variant="secondary"
                      disabled={retry.isPending}
                      onClick={async () => {
                        setError(null);
                        try {
                          await retry.mutateAsync(job._id);
                        } catch (err) {
                          setError(extractErrorMessage(err));
                        }
                      }}
                    >
                      Retry
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {(jobs.data ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-sm text-slate-500">
                  Nothing printed yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableWrap>
    </Card>
  );
}
