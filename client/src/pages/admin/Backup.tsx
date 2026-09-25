import { useEffect, useState } from "react";

import { Button, Card, ErrorText } from "../../components/ui";
import { api, extractErrorMessage } from "../../lib/apiClient";

interface RestoreSummary {
  message: string;
  summary: Record<string, number>;
}

interface BackupRecordDto {
  _id: string;
  filename: string;
  sizeBytes: number;
  trigger: "manual" | "scheduled";
  createdAt: string;
}

interface ScheduleDto {
  enabled: boolean;
  time: string;
  lastRunAt?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function downloadBlobResponse(res: { data: BlobPart; headers: Record<string, unknown> }, fallbackName: string) {
  const disposition = res.headers["content-disposition"] as string | undefined;
  const match = disposition?.match(/filename="([^"]+)"/);
  const filename = match?.[1] || fallbackName;
  const url = URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Backup() {
  const [records, setRecords] = useState<BackupRecordDto[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [downloadingNow, setDownloadingNow] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [serverStorage, setServerStorage] = useState(true);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [rowResult, setRowResult] = useState<RestoreSummary | null>(null);

  const [schedule, setSchedule] = useState<ScheduleDto>({ enabled: false, time: "02:00" });
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleSaved, setScheduleSaved] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreResult, setRestoreResult] = useState<RestoreSummary | null>(null);

  async function loadRecords() {
    setLoadingList(true);
    setListError(null);
    try {
      const res = await api.get<BackupRecordDto[]>("/backup");
      setRecords(res.data);
    } catch (err) {
      setListError(extractErrorMessage(err));
    } finally {
      setLoadingList(false);
    }
  }

  async function loadSchedule() {
    try {
      const res = await api.get<ScheduleDto>("/backup/schedule");
      setSchedule(res.data);
    } catch {
      // non-fatal - schedule section just falls back to its defaults
    }
  }

  useEffect(() => {
    loadRecords();
    loadSchedule();
    api
      .get<{ serverStorage: boolean }>("/backup/capabilities")
      .then((res) => setServerStorage(res.data.serverStorage))
      .catch(() => setServerStorage(true)); // assume available; the button's own error still guards it
  }, []);

  async function downloadNow() {
    setGenError(null);
    setDownloadingNow(true);
    try {
      const res = await api.get("/backup/export", { responseType: "blob" });
      await downloadBlobResponse(res, "backup.json");
    } catch (err) {
      setGenError(extractErrorMessage(err));
    } finally {
      setDownloadingNow(false);
    }
  }

  async function generate() {
    setGenError(null);
    setGenerating(true);
    try {
      await api.post("/backup/generate");
      await loadRecords();
    } catch (err) {
      setGenError(extractErrorMessage(err));
    } finally {
      setGenerating(false);
    }
  }

  async function downloadRecord(record: BackupRecordDto) {
    setRowError(null);
    setBusyId(record._id);
    try {
      const res = await api.get(`/backup/${record._id}/download`, { responseType: "blob" });
      await downloadBlobResponse(res, record.filename);
    } catch (err) {
      setRowError(extractErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function restoreRecord(record: BackupRecordDto) {
    if (
      !confirm(
        `Restore "${record.filename}"? This replaces this restaurant's current menu, tables, chefs, team, awards, coupons, reviews, orders and chat history with what's in the backup.`
      )
    )
      return;
    setRowError(null);
    setRowResult(null);
    setBusyId(record._id);
    try {
      const res = await api.post<RestoreSummary>(`/backup/${record._id}/restore`);
      setRowResult(res.data);
    } catch (err) {
      setRowError(extractErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function removeRecord(record: BackupRecordDto) {
    if (!confirm(`Delete "${record.filename}"? This cannot be undone.`)) return;
    setRowError(null);
    setBusyId(record._id);
    try {
      await api.delete(`/backup/${record._id}`);
      setRecords((prev) => prev.filter((r) => r._id !== record._id));
    } catch (err) {
      setRowError(extractErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function saveSchedule() {
    setScheduleError(null);
    setScheduleSaved(false);
    setScheduleSaving(true);
    try {
      const res = await api.put<ScheduleDto>("/backup/schedule", { enabled: schedule.enabled, time: schedule.time });
      setSchedule(res.data);
      setScheduleSaved(true);
    } catch (err) {
      setScheduleError(extractErrorMessage(err));
    } finally {
      setScheduleSaving(false);
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] || null);
    setConfirmed(false);
    setRestoreResult(null);
    setRestoreError(null);
  }

  async function restoreFromUpload() {
    if (!file || !confirmed) return;
    if (
      !confirm(
        "This replaces this restaurant's current menu, tables, chefs, team, awards, coupons, reviews, orders and chat history with what's in the file. Continue?"
      )
    )
      return;

    setRestoreError(null);
    setRestoreResult(null);
    setRestoring(true);
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("That file isn't valid JSON");
      }
      const res = await api.post<RestoreSummary>("/backup/import", parsed);
      setRestoreResult(res.data);
      setFile(null);
      setConfirmed(false);
    } catch (err) {
      setRestoreError(extractErrorMessage(err));
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-800">Backup &amp; Restore</h1>
      <p className="text-sm text-slate-500">
        Generate snapshots of this restaurant's data (menu, tables, chefs, team, awards, coupons, reviews, orders and
        chat history), stored on the server so they can be downloaded or restored later - into this same database, or a
        fresh one after migrating servers. Admin logins are not included; you always sign in with your current admin
        account.
      </p>

      <Card>
        <h2 className="mb-2 text-lg font-semibold text-slate-800">Generate a backup</h2>
        <p className="mb-3 text-sm text-slate-500">
          <strong>Download backup</strong> saves the snapshot straight to your device and works on any host.
          {serverStorage
            ? " Generate backup also keeps a copy on the server, listed below."
            : " Saving copies on the server isn't available on this host (read-only storage), so use Download."}
        </p>
        <ErrorText>{genError}</ErrorText>
        <div className="flex flex-wrap gap-2">
          <Button onClick={downloadNow} disabled={downloadingNow} className="self-start">
            {downloadingNow ? "Preparing..." : "Download backup"}
          </Button>
          {serverStorage && (
            <Button variant="secondary" onClick={generate} disabled={generating} className="self-start">
              {generating ? "Generating..." : "Generate backup (save on server)"}
            </Button>
          )}
        </div>
      </Card>

      {serverStorage && (
        <Card>
          <h2 className="mb-2 text-lg font-semibold text-slate-800">Automatic daily backup</h2>
          <p className="mb-3 text-sm text-slate-500">
            When enabled, a backup is generated automatically every day at the chosen time.
          </p>
          <ErrorText>{scheduleError}</ErrorText>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={schedule.enabled}
                onChange={(e) => {
                  setSchedule((s) => ({ ...s, enabled: e.target.checked }));
                  setScheduleSaved(false);
                }}
              />
              Enabled
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              Time
              <input
                type="time"
                className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                value={schedule.time}
                onChange={(e) => {
                  setSchedule((s) => ({ ...s, time: e.target.value }));
                  setScheduleSaved(false);
                }}
              />
            </label>
            <Button onClick={saveSchedule} disabled={scheduleSaving} className="self-start">
              {scheduleSaving ? "Saving..." : "Save schedule"}
            </Button>
            {scheduleSaved && <span className="text-sm text-green-700">Saved</span>}
          </div>
          {schedule.lastRunAt && (
            <p className="mt-2 text-xs text-slate-400">
              Last automatic run: {new Date(schedule.lastRunAt).toLocaleString()}
            </p>
          )}
        </Card>
      )}

      {serverStorage && (
        <Card>
          <h2 className="mb-2 text-lg font-semibold text-slate-800">Backups on this server</h2>
          <ErrorText>{listError}</ErrorText>
          <ErrorText>{rowError}</ErrorText>
          {rowResult && (
            <div className="mb-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
              <p className="font-medium">{rowResult.message}</p>
              <ul className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3">
                {Object.entries(rowResult.summary).map(([key, count]) => (
                  <li key={key}>
                    {key}: {count}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {loadingList ? (
            <p className="text-sm text-slate-500">Loading...</p>
          ) : records.length === 0 ? (
            <p className="text-sm text-slate-500">No backups yet - generate one above.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3 font-medium">File</th>
                    <th className="py-2 pr-3 font-medium">Created</th>
                    <th className="py-2 pr-3 font-medium">Trigger</th>
                    <th className="py-2 pr-3 font-medium">Size</th>
                    <th className="py-2 pr-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record._id} className="border-b border-slate-100">
                      <td className="py-2 pr-3 font-mono text-xs text-slate-700">{record.filename}</td>
                      <td className="py-2 pr-3 text-slate-600">{new Date(record.createdAt).toLocaleString()}</td>
                      <td className="py-2 pr-3 text-slate-600 capitalize">{record.trigger}</td>
                      <td className="py-2 pr-3 text-slate-600">{formatSize(record.sizeBytes)}</td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            disabled={busyId === record._id}
                            onClick={() => downloadRecord(record)}
                          >
                            Download
                          </Button>
                          <Button
                            variant="secondary"
                            disabled={busyId === record._id}
                            onClick={() => restoreRecord(record)}
                          >
                            Restore
                          </Button>
                          <Button
                            variant="danger"
                            disabled={busyId === record._id}
                            onClick={() => removeRecord(record)}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <Card>
        <h2 className="mb-2 text-lg font-semibold text-slate-800">Restore from an uploaded file</h2>
        <p className="mb-3 text-sm text-slate-500">
          For migrating from a different server: upload a backup JSON file downloaded from there. This replaces this
          restaurant's current menu, tables, chefs, team, awards, coupons, reviews, orders and chat history with what's
          in the file.
        </p>
        <div className="flex flex-col gap-3">
          <input type="file" accept="application/json,.json" onChange={handleFile} className="text-sm text-slate-600" />
          {file && (
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I understand this will replace this restaurant's current data with what's in this backup file.
            </label>
          )}
          <ErrorText>{restoreError}</ErrorText>
          {restoreResult && (
            <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
              <p className="font-medium">{restoreResult.message}</p>
              <ul className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3">
                {Object.entries(restoreResult.summary).map(([key, count]) => (
                  <li key={key}>
                    {key}: {count}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Button
            variant="danger"
            onClick={restoreFromUpload}
            disabled={!file || !confirmed || restoring}
            className="self-start"
          >
            {restoring ? "Restoring..." : "Restore from uploaded file"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
