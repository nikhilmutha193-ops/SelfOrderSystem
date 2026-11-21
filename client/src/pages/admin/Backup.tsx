import { useEffect, useMemo, useState } from "react";

import { useAdmin } from "../../lib/adminAuth";
import { api, extractErrorMessage } from "../../shared/api/client";
import { confirmDialog } from "../../shared/ui/confirm";
import { usePageTour, type TourStep } from "../../shared/ui/PageTour";
import { Button, Card, ErrorText, Input, PageHeader, Switch } from "../../shared/ui/ui";
import DatabaseConnection from "./DatabaseConnection";

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

interface CollectionDto {
  key: string;
  label: string;
  count: number;
}

interface ResetResult {
  message: string;
  removed: Record<string, number>;
  backupFilename: string | null;
}

interface ScheduleDto {
  enabled: boolean;
  time: string;
  times: string[];
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
  const { profile } = useAdmin();
  const isOwner = !!profile?.isOwner;
  const [collections, setCollections] = useState<CollectionDto[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [resetPassword, setResetPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<ResetResult | null>(null);

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

  const [schedule, setSchedule] = useState<ScheduleDto>({ enabled: false, time: "02:00", times: ["02:00"] });
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleSaved, setScheduleSaved] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreResult, setRestoreResult] = useState<RestoreSummary | null>(null);

  async function loadCollections() {
    try {
      const res = await api.get<CollectionDto[]>("/backup/collections");
      setCollections(res.data);
    } catch {
      // non-fatal - the reset card simply stays empty
    }
  }

  // Orders and order items always go together, so ticking one ticks the other.
  function togglePicked(key: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      const group = key === "orders" || key === "orderItems" ? ["orders", "orderItems"] : [key];
      const on = !next.has(key);
      for (const k of group) {
        if (on) next.add(k);
        else next.delete(k);
      }
      // The invoice counters make no sense once the orders are kept.
      if (!next.has("orders")) next.delete("invoiceCounters");
      return next;
    });
  }

  async function resetSelected() {
    if (picked.size === 0 || !resetPassword) return;
    const names = collections.filter((c) => picked.has(c.key)).map((c) => c.label);
    if (
      !(await confirmDialog({
        title: "Reset this data?",
        message: `${names.join(", ")} will be emptied for good. Everything else stays.`,
        confirmLabel: "Reset data",
      }))
    )
      return;
    setResetError(null);
    setResetResult(null);
    setResetting(true);
    try {
      const res = await api.post<ResetResult>("/backup/reset", { collections: [...picked], password: resetPassword });
      setResetResult(res.data);
      setPicked(new Set());
      setResetPassword("");
      await Promise.all([loadCollections(), loadRecords()]);
    } catch (err) {
      setResetError(extractErrorMessage(err));
    } finally {
      setResetting(false);
    }
  }

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
      setSchedule({ ...res.data, times: res.data.times?.length ? res.data.times : [res.data.time] });
    } catch {
      // non-fatal - schedule section just falls back to its defaults
    }
  }

  useEffect(() => {
    loadRecords();
    loadSchedule();
    if (isOwner) loadCollections();
    api
      .get<{ serverStorage: boolean }>("/backup/capabilities")
      .then((res) => setServerStorage(res.data.serverStorage))
      .catch(() => setServerStorage(true)); // assume available; the button's own error still guards it
  }, [isOwner]);

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
      !(await confirmDialog({
        title: "Restore this backup?",
        message: `${record.filename} replaces this restaurant's current menu, tables, orders, customers, bookings, inventory, staff and website content.`,
        confirmLabel: "Restore backup",
      }))
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
    if (
      !(await confirmDialog({
        title: "Delete this backup?",
        message: `${record.filename} is removed from the server. This can't be undone.`,
        confirmLabel: "Delete backup",
      }))
    )
      return;
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
      const res = await api.put<ScheduleDto>("/backup/schedule", { enabled: schedule.enabled, times: schedule.times });
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
      !(await confirmDialog({
        title: "Restore from this file?",
        message:
          "This replaces this restaurant's current menu, tables, orders, customers, bookings, inventory, staff and website content with what's in the file.",
        confirmLabel: "Restore",
      }))
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

  const tourSteps: TourStep[] = useMemo(
    () => [
      {
        target: "backup-generate",
        title: "Generate a backup",
        description: "Download a snapshot straight to your device, or (where supported) keep a copy on the server too.",
      },
      ...(serverStorage
        ? [
            {
              target: "backup-schedule",
              title: "Automatic daily backup",
              description: "Turn on a daily automatic backup at a time you choose.",
            },
            {
              target: "backup-list",
              title: "Backups on this server",
              description: "Download, restore or delete a past backup. Restoring replaces this restaurant's current data.",
            },
          ]
        : []),
      {
        target: "backup-upload",
        title: "Restore from an uploaded file",
        description: "For migrating servers: upload a backup JSON file downloaded elsewhere to restore it here.",
      },
    ],
    [serverStorage]
  );
  usePageTour(tourSteps);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 sm:gap-6">
      <PageHeader
        title="Backup & Restore"
        description={
          <>
            Generate snapshots of this restaurant's data (menu, tables, orders, customers, bookings, inventory, staff
            and website content), stored on the server so they can be downloaded or restored later - into this same
            database, or a fresh one after migrating servers. Admin logins are not included; you always sign in with
            your current admin account.
          </>
        }
      />

      <Card data-tour="backup-generate">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Generate a backup</h2>
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
        <Card data-tour="backup-schedule">
          <h2 className="mb-3 text-base font-semibold text-slate-900">Automatic daily backup</h2>
          <p className="mb-3 text-sm text-slate-500">
            When enabled, a backup is generated automatically every day at each of the times below (up to 6).
          </p>
          <ErrorText>{scheduleError}</ErrorText>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3">
              <Switch
                id="backup-enabled"
                checked={schedule.enabled}
                onChange={(v) => {
                  setSchedule((s) => ({ ...s, enabled: v }));
                  setScheduleSaved(false);
                }}
              />
              <label htmlFor="backup-enabled" className="text-sm font-medium text-slate-700">
                Enabled
              </label>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-slate-700">Times each day</span>
              {schedule.times.map((t, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    type="time"
                    className="!w-36"
                    value={t}
                    onChange={(e) => {
                      const next = schedule.times.map((x, i) => (i === index ? e.target.value : x));
                      setSchedule((s) => ({ ...s, times: next }));
                      setScheduleSaved(false);
                    }}
                  />
                  {schedule.times.length > 1 && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setSchedule((s) => ({ ...s, times: s.times.filter((_, i) => i !== index) }));
                        setScheduleSaved(false);
                      }}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}
              {schedule.times.length < 6 && (
                <Button
                  variant="secondary"
                  className="self-start"
                  onClick={() => {
                    setSchedule((s) => ({ ...s, times: [...s.times, "14:00"] }));
                    setScheduleSaved(false);
                  }}
                >
                  Add another time
                </Button>
              )}
            </div>
            <Button onClick={saveSchedule} disabled={scheduleSaving} className="self-start">
              {scheduleSaving ? "Saving..." : "Save schedule"}
            </Button>
            {scheduleSaved && <span className="text-sm font-medium text-emerald-700">Saved</span>}
          </div>
          {schedule.lastRunAt && (
            <p className="mt-2 text-xs text-slate-400">
              Last automatic run: {new Date(schedule.lastRunAt).toLocaleString()}
            </p>
          )}
        </Card>
      )}

      {serverStorage && (
        <Card data-tour="backup-list">
          <h2 className="mb-3 text-base font-semibold text-slate-900">Backups on this server</h2>
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
                    <th>File</th>
                    <th>Created</th>
                    <th>Trigger</th>
                    <th>Size</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record._id} className="border-b border-slate-100">
                      <td className="pr-3 font-mono text-xs text-slate-700">{record.filename}</td>
                      <td className="pr-3 text-slate-600">{new Date(record.createdAt).toLocaleString()}</td>
                      <td className="pr-3 text-slate-600 capitalize">{record.trigger}</td>
                      <td className="pr-3 text-slate-600">{formatSize(record.sizeBytes)}</td>
                      <td className="pr-3">
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

      <Card data-tour="backup-upload">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Restore from an uploaded file</h2>
        <p className="mb-3 text-sm text-slate-500">
          For migrating from a different server: upload a backup JSON file downloaded from there. This replaces this
          restaurant's current menu, tables, orders, customers, bookings, inventory, staff and website content with
          what's in the file.
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
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
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

      {isOwner && <DatabaseConnection />}

      {isOwner && (
        <Card data-tour="backup-reset">
          <h2 className="mb-3 text-base font-semibold text-slate-900">Reset data</h2>
          <p className="mb-3 text-sm text-slate-500">
            Permanently empty the collections you tick, for example to clear test orders before going live.
            {serverStorage
              ? " A backup is saved on the server first, so you can restore it from the list above."
              : " This host can't keep a backup copy, so use Download backup above first."}{" "}
            Orders and order items are reset together, and the invoice counters can only be reset with the orders.
          </p>
          <ErrorText>{resetError}</ErrorText>
          {resetResult && (
            <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
              <p className="font-medium">
                Data reset{resetResult.backupFilename ? `. Backup saved as ${resetResult.backupFilename}.` : "."}
              </p>
              <ul className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3">
                {Object.entries(resetResult.removed).map(([key, count]) => (
                  <li key={key}>
                    {key}: {count} removed
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            {collections.map((c) => (
              <label key={c.key} className="flex items-center gap-2 py-1 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={picked.has(c.key)}
                  onChange={() => togglePicked(c.key)}
                  disabled={c.count === 0 && !picked.has(c.key)}
                />
                <span className="flex-1">{c.label}</span>
                <span className="text-xs tabular-nums text-slate-400">{c.count}</span>
              </label>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              Your admin password
              <Input
                type="password"
                className="!w-56"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
            <Button
              variant="danger"
              onClick={resetSelected}
              disabled={picked.size === 0 || !resetPassword || resetting}
            >
              {resetting ? "Resetting..." : `Reset ${picked.size} selected`}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
