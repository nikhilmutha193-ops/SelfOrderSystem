import {
  Armchair,
  CircleCheck,
  Clock,
  CookingPot,
  DoorOpen,
  KeyRound,
  Pencil,
  Plus,
  Timer,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { AreasCard } from "../../features/pricing/components/AreasCard";
import { useAreas, useSetTableArea } from "../../features/pricing/queries";
import { useCanEdit } from "../../lib/adminAuth";
import { useDineInPayment } from "../../lib/useDineInPayment";
import type { GuestAccess, RequiredDetails, TableLoginSettings, TableRow } from "../../lib/types";
import { api, extractErrorMessage } from "../../shared/api/client";
import { confirmDialog } from "../../shared/ui/confirm";
import { Dialog } from "../../shared/ui/Dialog";
import { usePageTour, type TourStep } from "../../shared/ui/PageTour";
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

interface LoginDraft {
  allowQrScan: boolean;
  qr: GuestAccess;
  manual: GuestAccess;
  requiredDetails: RequiredDetails;
}

const DEFAULT_LOGIN_DRAFT: LoginDraft = {
  allowQrScan: true,
  qr: { placeOrder: true, showMenu: true, showFeedback: true },
  manual: { placeOrder: true, showMenu: true, showFeedback: true },
  requiredDetails: { name: true, phone: false, members: true, birthday: false },
};

function EditTableDialog({ table, onClose, onSaved }: { table: TableRow; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState(table.code);
  const [pin, setPin] = useState(table.password ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedCode = code.trim();
  const changes: { code?: string; password?: string } = {};
  if (trimmedCode !== table.code) changes.code = trimmedCode;
  if (pin && pin !== table.password) changes.password = pin;
  const dirty = Object.keys(changes).length > 0;

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Edit table ${table.code}`}
      description="Guests sign in with the new code and PIN. Printed QR codes keep working."
      size="sm"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!trimmedCode) {
          setError("Table code can't be empty");
          return;
        }
        if (!dirty) {
          onClose();
          return;
        }
        setError(null);
        setSaving(true);
        try {
          await api.put(`/tables/${table._id}`, changes);
          onSaved();
          onClose();
        } catch (err) {
          setError(extractErrorMessage(err));
        } finally {
          setSaving(false);
        }
      }}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving} disabled={!dirty}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Table code" htmlFor="edit-table-code">
          <Input
            id="edit-table-code"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
        </Field>
        <Field label="PIN" htmlFor="edit-table-pin">
          <Input
            id="edit-table-pin"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            required
          />
        </Field>
        <ErrorText>{error}</ErrorText>
      </div>
    </Dialog>
  );
}

export default function Tables() {
  const [tables, setTables] = useState<TableRow[]>([]);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TableRow | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [autoReleaseMinutes, setAutoReleaseMinutes] = useState("0");
  const [savingExpiry, setSavingExpiry] = useState(false);
  const [expiryMessage, setExpiryMessage] = useState<string | null>(null);
  const [expiryDraft, setExpiryDraft] = useState<Record<string, string>>({});
  const [, forceTick] = useState(0);
  const [captains, setCaptains] = useState<{ _id: string; username: string }[]>([]);
  const [loginDraft, setLoginDraft] = useState<LoginDraft>(DEFAULT_LOGIN_DRAFT);
  const [loginSaved, setLoginSaved] = useState<LoginDraft>(DEFAULT_LOGIN_DRAFT);
  const [loginSaving, setLoginSaving] = useState(false);
  const [loginMessage, setLoginMessage] = useState<string | null>(null);
  const { allowQrScan, requiredDetails } = loginDraft;
  const guestAccess = { qr: loginDraft.qr, manual: loginDraft.manual };
  const loginDirty = JSON.stringify(loginDraft) !== JSON.stringify(loginSaved);

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

  const { areas } = useAreas();
  const setArea = useSetTableArea();
  const canEditTables = useCanEdit("tables");
  // Tables have no captain when guests pay when ordering.
  const showCaptains = useDineInPayment() !== "upfront";

  async function assignArea(table: TableRow, areaId: string) {
    setError(null);
    try {
      await setArea.mutateAsync({ tableId: table._id, areaId: areaId || null });
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function changeKind(table: TableRow) {
    const toGuest = !table.isGuest;
    const confirmed = await confirmDialog({
      title: toGuest ? `Make ${table.code} a guest table?` : `Make ${table.code} a normal table?`,
      message: toGuest
        ? "A guest table is shared by walk-ins and the counter: several orders can run on it at once and it never needs releasing. Its captain and area are cleared."
        : "It becomes a normal table: one party at a time, signed in with its code and PIN, and released when they leave.",
      confirmLabel: toGuest ? "Make guest table" : "Make normal table",
      tone: "primary",
    });
    if (!confirmed) return;
    setError(null);
    try {
      await api.put(`/tables/${table._id}`, { isGuest: toGuest });
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

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

  useEffect(() => {
    api
      .get<TableLoginSettings>("/tables/settings")
      .then((res) => {
        const loaded: LoginDraft = {
          allowQrScan: res.data.allowQrScan,
          qr: res.data.qr ?? DEFAULT_LOGIN_DRAFT.qr,
          manual: res.data.manual ?? DEFAULT_LOGIN_DRAFT.manual,
          requiredDetails: res.data.requiredDetails ?? DEFAULT_LOGIN_DRAFT.requiredDetails,
        };
        setLoginDraft(loaded);
        setLoginSaved(loaded);
      })
      .catch(() => {
        // Non-critical: the switch just falls back to "on" (current default) if this fails.
      });
  }, []);

  function setAccess(via: "qr" | "manual", field: keyof GuestAccess, value: boolean) {
    setLoginDraft((d) => {
      const next = { ...d[via], [field]: value };
      if (field === "showMenu" && !value) next.placeOrder = false;
      return { ...d, [via]: next };
    });
  }

  async function saveLoginSettings() {
    setLoginSaving(true);
    setLoginMessage(null);
    setError(null);
    try {
      await api.put("/tables/settings", loginDraft);
      setLoginSaved(loginDraft);
      setLoginMessage("Saved");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoginSaving(false);
    }
  }

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
    if (
      !(await confirmDialog({
        title: `Delete table ${table.code}?`,
        message: "Its printed QR code stops working. This can't be undone.",
        confirmLabel: "Delete table",
      }))
    )
      return;
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

  const seated = tables.filter((t) => !t.isGuest);
  const counts = {
    available: seated.filter((t) => t.status === "available").length,
    occupied: seated.filter((t) => t.status === "occupied").length,
    awaiting: seated.filter((t) => t.status === "awaiting_payment").length,
  };

  const tourSteps: TourStep[] = useMemo(
    () => [
      {
        target: "tables-stats",
        title: "Floor status",
        description: "How many seated tables are free, occupied, or waiting to pay right now.",
      },
      {
        target: "tables-add",
        title: "Add a table",
        description:
          "Set its code and PIN - this is what guests type to sign in. Mark it a guest table for walk-ins/counters that never need releasing.",
      },
      {
        target: "tables-auto-release",
        title: "Auto-release",
        description:
          "Free a table automatically after it's been seated this long. Each table can override the default below.",
      },
      {
        target: "tables-qr-setting",
        title: "Table sign-in page",
        description: "Turn the QR-scan sign-in option on or off for guests, in addition to typing the code and PIN.",
      },
      {
        target: "tables-list",
        title: "All tables",
        description:
          "See each table's status, who's captaining it, its auto-release override, and edit its code and PIN, release it or delete it.",
      },
    ],
    [],
  );
  usePageTour(tourSteps);

  return (
    <Page>
      <PageHeader
        title="Tables"
        description="Table logins for guests scanning the QR code, who looks after each table, and when idle tables free up."
      />

      <div className="grid grid-cols-3 gap-3 sm:gap-4" data-tour="tables-stats">
        <StatCard label="Free" value={counts.available} icon={CircleCheck} tone="green" />
        <StatCard label="Seated" value={counts.occupied} icon={Armchair} tone="amber" />
        <StatCard label="Waiting to pay" value={counts.awaiting} icon={Wallet} tone="red" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <Card data-tour="tables-add">
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

        <Card data-tour="tables-auto-release">
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

      <Card data-tour="tables-qr-setting">
        <CardHeader
          icon={KeyRound}
          title="Table sign-in page"
          description="What guests can do after they sign in to a table, and what we ask them before their first order."
        />

        <div className="rounded-lg border border-slate-200 px-3 py-2.5">
          <Switch
            id="allow-qr-scan"
            checked={allowQrScan}
            disabled={!canEditTables}
            onChange={(v) => setLoginDraft((d) => ({ ...d, allowQrScan: v }))}
            label="Let guests scan a QR code on the sign-in page"
            description="Shows a camera-scan button next to the table code and PIN form."
          />
        </div>

        <div className="mt-5">
          <h3 className="text-sm font-semibold text-slate-900">Guest access</h3>
          <p className="text-xs text-slate-500">Set separately for how the guest signed in.</p>
          <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
            <div className="grid grid-cols-[1fr_5.5rem_5.5rem] items-center gap-x-2 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 sm:grid-cols-[1fr_8rem_8rem]">
              <span />
              <span className="text-center">Scanned QR</span>
              <span className="text-center">Code and PIN</span>
            </div>
            {(
              [
                ["showMenu", "Show the menu", "Dishes, filters and search."],
                ["placeOrder", "Allow placing orders", "When off, guests can browse and staff place the order."],
                ["showFeedback", "Show the feedback form", "Star rating and comment."],
              ] as const
            ).map(([field, title, hint]) => (
              <div
                key={field}
                className="grid grid-cols-[1fr_5.5rem_5.5rem] items-center gap-x-2 border-t border-slate-100 px-3 py-3 sm:grid-cols-[1fr_8rem_8rem]"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800">{title}</p>
                  <p className="text-xs text-slate-500">{hint}</p>
                </div>
                {(["qr", "manual"] as const).map((via) => (
                  <div key={via} className="flex justify-center">
                    <Switch
                      id={`${via}-${field}`}
                      checked={guestAccess[via][field]}
                      disabled={!canEditTables || (field === "placeOrder" && !guestAccess[via].showMenu)}
                      onChange={(v) => setAccess(via, field, v)}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <h3 className="text-sm font-semibold text-slate-900">Details asked before the first order</h3>
          <p className="text-xs text-slate-500">
            Only ticked details are asked. Name and members are required; phone and date of birth are optional for the
            guest.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(
              [
                ["name", "Name"],
                ["members", "Number of members"],
                ["phone", "Phone number (optional)"],
                ["birthday", "Date of birth (optional)"],
              ] as const
            ).map(([field, label]) => (
              <label
                key={field}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium ${
                  requiredDetails[field]
                    ? "border-orange-300 bg-orange-50 text-orange-900"
                    : "border-slate-200 text-slate-600"
                }`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={requiredDetails[field]}
                  disabled={!canEditTables}
                  onChange={(e) =>
                    setLoginDraft((d) => ({
                      ...d,
                      requiredDetails: { ...d.requiredDetails, [field]: e.target.checked },
                    }))
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        {canEditTables && (
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            <Button type="button" onClick={saveLoginSettings} loading={loginSaving} disabled={!loginDirty}>
              {loginSaving ? "Saving..." : "Save changes"}
            </Button>
            {loginDirty && <span className="text-xs text-amber-700">You have unsaved changes</span>}
            {!loginDirty && loginMessage && (
              <span className="text-sm font-medium text-emerald-700">{loginMessage}</span>
            )}
          </div>
        )}
      </Card>

      <AreasCard areas={areas} canEdit={canEditTables} />

      <ErrorText>{error}</ErrorText>

      <Card data-tour="tables-list">
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
                  {areas.length > 0 && <th>Area</th>}
                  {showCaptains && <th>Captain</th>}
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
                    {areas.length > 0 && (
                      <td>
                        {table.isGuest ? (
                          <span className="text-xs text-slate-400">—</span>
                        ) : (
                          <Select
                            aria-label={`Area for ${table.code}`}
                            className="!w-36"
                            value={table.areaId ?? ""}
                            onChange={(e) => assignArea(table, e.target.value)}
                          >
                            <option value="">No area</option>
                            {areas.map((a) => (
                              <option key={a._id} value={a._id}>
                                {a.name}
                              </option>
                            ))}
                          </Select>
                        )}
                      </td>
                    )}
                    {showCaptains && (
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
                    )}
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
                          {canEditTables && (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={Pencil}
                              onClick={() => setEditing(table)}
                              aria-label={`Edit ${table.code}`}
                            >
                              Edit
                            </Button>
                          )}
                          {canEditTables && (
                            <Button size="sm" variant="ghost" icon={Users} onClick={() => changeKind(table)}>
                              {table.isGuest ? "Make normal" : "Make guest"}
                            </Button>
                          )}
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      {editing && <EditTableDialog table={editing} onClose={() => setEditing(null)} onSaved={load} />}
    </Page>
  );
}
