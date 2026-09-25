import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Badge, Button, Card, ErrorText, Input, TableWrap } from "../../components/ui";
import { api, extractErrorMessage } from "../../lib/apiClient";
import type { TableRow } from "../../lib/types";

function elapsedSince(iso?: string): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatMinutes(mins: number): string {
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

export default function Tables() {
  const [tables, setTables] = useState<TableRow[]>([]);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [newPin, setNewPin] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [autoReleaseMinutes, setAutoReleaseMinutes] = useState("0");
  const [savingExpiry, setSavingExpiry] = useState(false);
  const [expiryMessage, setExpiryMessage] = useState<string | null>(null);
  const [expiryDraft, setExpiryDraft] = useState<Record<string, string>>({});
  const [, forceTick] = useState(0);

  const savedDefault = Number(autoReleaseMinutes);
  const defaultExpiryLabel = savedDefault > 0 ? `${savedDefault} (default)` : "never";

  function load() {
    api
      .get<TableRow[]>("/tables")
      .then((res) => setTables(res.data))
      .catch((err) => setError(extractErrorMessage(err)));
  }

  useEffect(load, []);

  useEffect(() => {
    api
      .get<{ tableAutoReleaseMinutes?: number }>("/restaurant/settings")
      .then((res) => setAutoReleaseMinutes(String(res.data.tableAutoReleaseMinutes ?? 0)))
      .catch(() => {
        // Non-critical: the input just falls back to "0" (disabled) if this fails.
      });
  }, []);

  // Re-renders every 30s so "occupied since" keeps counting up without a reload.
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  async function saveExpiry(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setExpiryMessage(null);
    const minutes = Number(autoReleaseMinutes);
    if (!Number.isFinite(minutes) || minutes < 0) {
      setError("Auto-release minutes must be 0 or a positive number");
      return;
    }
    setSavingExpiry(true);
    try {
      await api.put("/restaurant/settings", { tableAutoReleaseMinutes: minutes });
      setExpiryMessage(minutes === 0 ? "Auto-release turned off" : `Tables now auto-release after ${minutes} minutes`);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSavingExpiry(false);
    }
  }

  async function saveExpiryOverride(table: TableRow) {
    const draft = expiryDraft[table._id];
    if (draft === undefined) return;
    setExpiryDraft((d) => {
      const next = { ...d };
      delete next[table._id];
      return next;
    });

    const trimmed = draft.trim();
    const value = trimmed === "" ? null : Number(trimmed);
    if (value === (table.autoReleaseMinutes ?? null)) return;
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      setError("Expiry must be 0 or a positive number of minutes");
      return;
    }

    setError(null);
    try {
      await api.put(`/tables/${table._id}`, { autoReleaseMinutes: value });
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/tables", { code, password, isGuest });
      setCode("");
      setPassword("");
      setIsGuest(false);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function remove(table: TableRow) {
    if (!window.confirm(`Delete table "${table.code}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await api.delete(`/tables/${table._id}`);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function release(table: TableRow) {
    try {
      await api.patch(`/tables/${table._id}/release`);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  function startReset(table: TableRow) {
    setResettingId(table._id);
    setNewPin("");
    setResetError(null);
  }

  function cancelReset() {
    setResettingId(null);
    setNewPin("");
    setResetError(null);
  }

  async function submitReset(tableId: string) {
    if (!newPin) return;
    setResetError(null);
    try {
      await api.put(`/tables/${tableId}`, { password: newPin });
      setResettingId(null);
      setNewPin("");
      load();
    } catch (err) {
      setResetError(extractErrorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-800">Tables</h1>

      <Card>
        <form onSubmit={saveExpiry} className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-slate-700">
            Auto-release after (minutes)
            <Input
              className="mt-1 w-40"
              type="number"
              min={0}
              value={autoReleaseMinutes}
              onChange={(e) => setAutoReleaseMinutes(e.target.value)}
            />
          </label>
          <Button type="submit" disabled={savingExpiry}>
            {savingExpiry ? "Saving..." : "Save"}
          </Button>
          {expiryMessage && <span className="text-xs text-green-700">{expiryMessage}</span>}
        </form>
        <p className="mt-2 text-xs text-slate-500">
          If a table stays occupied longer than this, it is automatically freed and the guest's session ends. Set to 0
          to disable auto-release. Any order the guest never sent to the kitchen is cancelled with the seating; counter
          orders and anything already sent are left alone. Individual tables can override this below.
        </p>
      </Card>

      <Card>
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-slate-700">
            Table code
            <Input
              className="mt-1"
              placeholder="e.g. tbl1"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            PIN
            <Input className="mt-1" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={isGuest} onChange={(e) => setIsGuest(e.target.checked)} />
            Guest table
          </label>
          <Button type="submit">Add table</Button>
        </form>
        <p className="mt-2 text-xs text-slate-500">
          A guest table is for walk-ins and the counter: it is never marked occupied, so several people can order from
          it at once and it never has to be released. They only give their name and mobile number.
        </p>
      </Card>

      <ErrorText>{error}</ErrorText>

      <Card>
        <TableWrap>
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-2">Code</th>
                <th className="pb-2">PIN</th>
                <th className="pb-2">Type</th>
                <th className="pb-2">Expires after</th>
                <th className="pb-2">Status</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {tables.map((table) => (
                <tr key={table._id} className="border-t border-slate-100">
                  <td className="py-1.5">{table.code}</td>
                  <td className="py-1.5 font-mono">{table.password || "-"}</td>
                  <td className="py-1.5">
                    {table.isGuest ? <Badge tone="blue">Guest</Badge> : <Badge tone="gray">Table</Badge>}
                  </td>
                  <td className="py-1.5">
                    {table.isGuest ? (
                      <span className="text-xs text-slate-400">n/a</span>
                    ) : (
                      (() => {
                        const raw = expiryDraft[table._id] ?? table.autoReleaseMinutes ?? "";
                        const effective = raw === "" ? savedDefault : Number(raw);
                        const hint =
                          !Number.isFinite(effective) || effective <= 0
                            ? "never expires"
                            : raw === ""
                              ? `follows default (${formatMinutes(savedDefault)})`
                              : `= ${formatMinutes(effective)}`;
                        return (
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <Input
                                className="w-20"
                                type="number"
                                min={0}
                                placeholder={defaultExpiryLabel}
                                value={raw}
                                onChange={(e) => setExpiryDraft((d) => ({ ...d, [table._id]: e.target.value }))}
                                onBlur={() => saveExpiryOverride(table)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") e.currentTarget.blur();
                                }}
                              />
                              <span className="text-xs text-slate-500">min</span>
                            </div>
                            <span className="text-xs text-slate-400">{hint}</span>
                          </div>
                        );
                      })()
                    )}
                  </td>
                  <td className="py-1.5">
                    {table.isGuest ? (
                      <span className="text-xs text-slate-400">shared</span>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        <Badge tone={table.status === "available" ? "green" : "amber"}>{table.status}</Badge>
                        {table.status === "occupied" && elapsedSince(table.occupiedAt) && (
                          <span className="text-xs text-slate-400">occupied {elapsedSince(table.occupiedAt)}</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-1.5">
                    {resettingId === table._id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          className="w-28"
                          placeholder="New PIN"
                          value={newPin}
                          onChange={(e) => setNewPin(e.target.value)}
                          autoFocus
                        />
                        <Button type="button" onClick={() => submitReset(table._id)} disabled={!newPin}>
                          Save
                        </Button>
                        <button className="text-slate-600 hover:underline" onClick={cancelReset}>
                          Cancel
                        </button>
                        {resetError && <span className="text-xs text-red-600">{resetError}</span>}
                      </div>
                    ) : (
                      <div className="flex gap-3">
                        {table.status === "occupied" && !table.isGuest && (
                          <button className="text-slate-600 hover:underline" onClick={() => release(table)}>
                            Release
                          </button>
                        )}
                        <button className="text-orange-600 hover:underline" onClick={() => startReset(table)}>
                          Reset PIN
                        </button>
                        <Link className="text-orange-600 hover:underline" to={`/admin/kot?tableId=${table._id}`}>
                          View KOT
                        </Link>
                        <button className="text-red-600 hover:underline" onClick={() => remove(table)}>
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </div>
  );
}
