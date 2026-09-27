import {
  Armchair,
  CircleCheck,
  Clock,
  CookingPot,
  DoorOpen,
  KeyRound,
  Plus,
  Timer,
  Trash2,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import type { TableRow } from "../../lib/types";
import { api, extractErrorMessage } from "../../shared/api/client";
import { buttonClass } from "../../shared/ui/styles";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorText,
  Field,
  Input,
  Page,
  PageHeader,
  Select,
  StatCard,
  Switch,
  TableWrap,
} from "../../shared/ui/ui";

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
  const [captains, setCaptains] = useState<{ _id: string; username: string }[]>([]);

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
      .get<{ _id: string; username: string }[]>("/tables/captains")
      .then((res) => setCaptains(res.data))
      .catch(() => setCaptains([]));
  }, []);

  async function assignCaptain(table: TableRow, captainId: string) {
    setError(null);
    try {
      await api.put(`/tables/${table._id}/captain`, { captainId: captainId || null });
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

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

  const seated = tables.filter((t) => !t.isGuest);
  const counts = {
    available: seated.filter((t) => t.status === "available").length,
    occupied: seated.filter((t) => t.status === "occupied").length,
    awaiting: seated.filter((t) => t.status === "awaiting_payment").length,
  };

  return (
    <Page>
      <PageHeader
        title="Tables"
        description="Table logins for guests scanning the QR code, who looks after each table, and when idle tables free up."
      />

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <StatCard label="Free" value={counts.available} icon={CircleCheck} tone="green" />
        <StatCard label="Seated" value={counts.occupied} icon={Armchair} tone="amber" />
        <StatCard label="Waiting to pay" value={counts.awaiting} icon={Wallet} tone="red" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <Card>
          <CardHeader
            icon={Plus}
            title="Add a table"
            description="A guest table is for walk-ins and the counter: several people can order from it at once and it never needs releasing."
          />
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <Field label="Table code" htmlFor="table-code">
              <Input
                id="table-code"
                placeholder="e.g. tbl1"
                autoComplete="off"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </Field>
            <Field label="PIN" htmlFor="table-pin">
              <Input
                id="table-pin"
                autoComplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            <div className="rounded-lg border border-slate-200 px-3 py-2.5 sm:col-span-2">
              <Switch
                id="table-guest"
                checked={isGuest}
                onChange={setIsGuest}
                label="Guest table"
                description="Never marked occupied. Guests only give a name and mobile number."
              />
            </div>
            <Button type="submit" icon={Plus} className="sm:col-span-2 sm:justify-self-start">
              Add table
            </Button>
          </form>
        </Card>

        <Card>
          <CardHeader
            icon={Timer}
            title="Auto-release"
            description="Free a table that stays seated longer than this. Unsent guest orders are cancelled; anything sent to the kitchen is kept."
          />
          <form onSubmit={saveExpiry} className="flex flex-wrap items-end gap-3">
            <Field label="Release after (minutes)" htmlFor="auto-release">
              <Input
                id="auto-release"
                className="!w-40"
                type="number"
                inputMode="numeric"
                min={0}
                value={autoReleaseMinutes}
                onChange={(e) => setAutoReleaseMinutes(e.target.value)}
              />
            </Field>
            <Button type="submit" loading={savingExpiry}>
              {savingExpiry ? "Saving..." : "Save"}
            </Button>
            {expiryMessage && <span className="pb-2.5 text-sm font-medium text-emerald-700">{expiryMessage}</span>}
          </form>
          <p className="mt-2 text-xs text-slate-500">0 turns auto-release off. Each table can override it below.</p>
        </Card>
      </div>

      <ErrorText>{error}</ErrorText>

      <Card>
        <CardHeader
          title="All tables"
          description={`${tables.length} table${tables.length === 1 ? "" : "s"}`}
          className="mb-3"
        />
        {tables.length === 0 ? (
          <EmptyState icon={Armchair} title="No tables yet" description="Add a table above, then print its QR code." />
        ) : (
          <TableWrap>
            <table className="min-w-[60rem]">
              <thead>
                <tr>
                  <th>Table</th>
                  <th>PIN</th>
                  <th>Status</th>
                  <th>Captain</th>
                  <th>Expires after</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tables.map((table) => (
                  <tr key={table._id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">{table.code}</span>
                        {table.isGuest && <Badge tone="blue">Guest</Badge>}
                      </div>
                    </td>
                    <td className="font-mono text-slate-600">{table.password || "—"}</td>
                    <td>
                      {table.isGuest ? (
                        <span className="text-xs text-slate-400">Shared</span>
                      ) : (
                        <div className="flex flex-col items-start gap-1">
                          <Badge
                            dot
                            tone={
                              table.status === "available"
                                ? "green"
                                : table.status === "awaiting_payment"
                                  ? "red"
                                  : "amber"
                            }
                          >
                            {table.status === "awaiting_payment"
                              ? "Waiting to pay"
                              : table.status === "available"
                                ? "Free"
                                : "Seated"}
                          </Badge>
                          {table.status !== "available" && elapsedSince(table.occupiedAt) && (
                            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                              <Clock size={12} aria-hidden="true" />
                              {elapsedSince(table.occupiedAt)}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      {table.isGuest ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <Select
                          aria-label={`Captain for ${table.code}`}
                          className="!w-36"
                          value={table.captainId ?? ""}
                          onChange={(e) => assignCaptain(table, e.target.value)}
                        >
                          <option value="">Anyone</option>
                          {captains.map((c) => (
                            <option key={c._id} value={c._id}>
                              {c.username}
                            </option>
                          ))}
                        </Select>
                      )}
                    </td>
                    <td>
                      {table.isGuest ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        (() => {
                          const raw = expiryDraft[table._id] ?? table.autoReleaseMinutes ?? "";
                          const effective = raw === "" ? savedDefault : Number(raw);
                          const hint =
                            !Number.isFinite(effective) || effective <= 0
                              ? "never expires"
                              : raw === ""
                                ? `default (${formatMinutes(savedDefault)})`
                                : `= ${formatMinutes(effective)}`;
                          return (
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1.5">
                                <Input
                                  aria-label={`Auto-release minutes for ${table.code}`}
                                  className="!w-24"
                                  type="number"
                                  inputMode="numeric"
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
                    <td className="text-right">
                      {resettingId === table._id ? (
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Input
                            aria-label={`New PIN for ${table.code}`}
                            className="!w-28"
                            placeholder="New PIN"
                            value={newPin}
                            onChange={(e) => setNewPin(e.target.value)}
                            autoFocus
                          />
                          <Button type="button" size="sm" onClick={() => submitReset(table._id)} disabled={!newPin}>
                            Save
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={cancelReset}>
                            Cancel
                          </Button>
                          {resetError && <span className="w-full text-xs text-red-600">{resetError}</span>}
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1 whitespace-nowrap">
                          {table.status === "occupied" && !table.isGuest && (
                            <Button size="sm" variant="ghost" icon={DoorOpen} onClick={() => release(table)}>
                              Release
                            </Button>
                          )}
                          <Link className={buttonClass("ghost", "sm")} to={`/admin/kot?tableId=${table._id}`}>
                            <CookingPot size={14} aria-hidden="true" />
                            KOT
                          </Link>
                          <Button size="sm" variant="ghost" icon={KeyRound} onClick={() => startReset(table)}>
                            PIN
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={Trash2}
                            className="!text-red-600 hover:!bg-red-50"
                            onClick={() => remove(table)}
                            aria-label={`Delete ${table.code}`}
                          >
                            Delete
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </Page>
  );
}
