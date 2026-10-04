import { Pencil, ShieldCheck, Trash2, UserPlus, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  MODULE_KEYS,
  MODULES,
  useAdmin,
  type AdminProfile,
  type ModuleKey,
  type PermissionLevel,
} from "../../lib/adminAuth";
import { api, extractErrorMessage } from "../../shared/api/client";
import { confirmDialog } from "../../shared/ui/confirm";
import { usePageTour, type TourStep } from "../../shared/ui/PageTour";
import { Alert, Badge, Button, Card, CardHeader, ErrorText, Field, Input, Page, PageHeader } from "../../shared/ui/ui";

type Permissions = Partial<Record<ModuleKey, PermissionLevel>>;

const PRESETS: { label: string; hint: string; permissions: Permissions }[] = [
  {
    label: "Captain (waiter)",
    hint: "Takes orders on the Captain app, serves ready items and answers guest requests.",
    permissions: { orders: "edit", tables: "view", kot: "edit", messages: "edit" },
  },
  {
    label: "Cashier",
    hint: "Bills and settles on the POS, runs cash shifts and prints.",
    permissions: { orders: "edit", tables: "view", kot: "view", dayClose: "edit", messages: "view" },
  },
];

function PresetButtons({ onPick, disabled }: { onPick: (permissions: Permissions) => void; disabled?: boolean }) {
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {PRESETS.map((preset) => (
        <Button
          key={preset.label}
          type="button"
          size="sm"
          variant="soft"
          icon={Wand2}
          disabled={disabled}
          title={preset.hint}
          onClick={() => onPick({ ...preset.permissions })}
        >
          {preset.label} preset
        </Button>
      ))}
    </div>
  );
}

const LEVEL_OPTIONS: { value: "" | PermissionLevel; label: string }[] = [
  { value: "", label: "None" },
  { value: "view", label: "View" },
  { value: "edit", label: "Edit" },
];

function PermissionGrid({
  value,
  onChange,
  disabled,
}: {
  value: Permissions;
  onChange: (next: Permissions) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-x-6 gap-y-1 lg:grid-cols-2">
      {MODULE_KEYS.map((key) => {
        const current = value[key] ?? "";
        return (
          <div key={key} className="flex items-center justify-between gap-3 border-b border-slate-100 py-2">
            <span className="min-w-0 text-sm text-slate-700">{MODULES[key]}</span>
            <div role="radiogroup" aria-label={MODULES[key]} className="flex shrink-0 rounded-lg bg-slate-100 p-0.5">
              {LEVEL_OPTIONS.map((o) => {
                const active = current === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={disabled}
                    onClick={() => {
                      const next = { ...value };
                      if (o.value === "") delete next[key];
                      else next[key] = o.value;
                      onChange(next);
                    }}
                    className={`min-h-[36px] min-w-14 rounded-md px-2.5 text-xs font-semibold transition-colors sm:min-h-[30px] ${
                      active
                        ? o.value === "edit"
                          ? "bg-orange-600 text-white shadow-card"
                          : o.value === "view"
                            ? "bg-white text-slate-900 shadow-card"
                            : "bg-white text-slate-500 shadow-card"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Admins() {
  const { profile } = useAdmin();
  const [admins, setAdmins] = useState<AdminProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Permissions>({});

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPermissions, setNewPermissions] = useState<Permissions>({});
  const [creating, setCreating] = useState(false);

  function load() {
    api
      .get<AdminProfile[]>("/admins")
      .then((res) => setAdmins(res.data))
      .catch((err) => setError(extractErrorMessage(err)));
  }

  useEffect(load, []);

  async function createAdmin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setCreating(true);
    try {
      await api.post("/admins", { username, password, permissions: newPermissions });
      setUsername("");
      setPassword("");
      setNewPermissions({});
      setMessage("Admin created");
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  async function savePermissions(id: string) {
    setError(null);
    setMessage(null);
    try {
      await api.put(`/admins/${id}/permissions`, { permissions: draft });
      setEditingId(null);
      setMessage("Permissions updated");
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function removeAdmin(id: string, name: string) {
    if (
      !(await confirmDialog({
        title: `Delete ${name}?`,
        message: "This login stops working at once and any assigned tables are freed. This can't be undone.",
        confirmLabel: "Delete login",
      }))
    )
      return;
    setError(null);
    try {
      await api.delete(`/admins/${id}`);
      setMessage("Admin deleted");
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  const tourSteps: TourStep[] = useMemo(
    () => [
      {
        target: "admin-form",
        title: "Add a staff login",
        description:
          "Set a username and password, then pick page access - use a preset for common roles (Captain, Cashier) or set each page to None/View/Edit yourself.",
      },
      {
        target: "admin-list",
        title: "Staff logins",
        description: "Edit an account's page access or delete it. The owner account always has full access and can't be edited here.",
      },
    ],
    []
  );
  usePageTour(tourSteps);

  return (
    <Page>
      <PageHeader
        title="Admin Users"
        description="Staff logins for the admin, POS and captain app. Each person only sees the pages you allow."
      />
      <ErrorText>{error}</ErrorText>
      {message && <Alert tone="success">{message}</Alert>}

      <Card data-tour="admin-form">
        <CardHeader icon={UserPlus} title="Add a staff login" />
        <form onSubmit={createAdmin} className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Username" htmlFor="new-admin-username">
              <Input
                id="new-admin-username"
                autoComplete="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </Field>
            <Field label="Password" htmlFor="new-admin-password" hint="At least 6 characters.">
              <Input
                id="new-admin-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </Field>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Page access</p>
            <PresetButtons onPick={setNewPermissions} />
            <PermissionGrid value={newPermissions} onChange={setNewPermissions} />
          </div>
          <Button type="submit" icon={UserPlus} loading={creating} className="self-start">
            {creating ? "Creating..." : "Create login"}
          </Button>
        </form>
      </Card>

      <Card data-tour="admin-list">
        <CardHeader title="Staff logins" description={`${admins.length} account${admins.length === 1 ? "" : "s"}`} />
        <div className="flex flex-col gap-3">
          {admins.map((admin) => {
            const granted = MODULE_KEYS.filter((k) => admin.permissions?.[k]);
            return (
              <div key={admin.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">
                      {admin.username.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="truncate font-semibold text-slate-900">{admin.username}</span>
                    {admin.isOwner && (
                      <Badge tone="blue">
                        <ShieldCheck size={12} aria-hidden="true" />
                        Owner
                      </Badge>
                    )}
                    {admin.id === profile?.id && <Badge tone="gray">You</Badge>}
                  </div>
                  <div className="flex gap-1">
                    {!admin.isOwner && (
                      <Button
                        type="button"
                        size="sm"
                        variant={editingId === admin.id ? "secondary" : "ghost"}
                        icon={editingId === admin.id ? undefined : Pencil}
                        onClick={() => {
                          setEditingId(editingId === admin.id ? null : admin.id);
                          setDraft(admin.permissions ?? {});
                        }}
                      >
                        {editingId === admin.id ? "Cancel" : "Edit access"}
                      </Button>
                    )}
                    {!admin.isOwner && admin.id !== profile?.id && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        icon={Trash2}
                        className="!text-red-600 hover:!bg-red-50"
                        onClick={() => removeAdmin(admin.id, admin.username)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </div>

                {admin.isOwner ? (
                  <p className="mt-2 text-sm text-slate-500">The owner account always has full access.</p>
                ) : editingId === admin.id ? (
                  <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4">
                    <PresetButtons onPick={setDraft} />
                    <PermissionGrid value={draft} onChange={setDraft} />
                    <Button type="button" className="self-start" onClick={() => savePermissions(admin.id)}>
                      Save access
                    </Button>
                  </div>
                ) : granted.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">No pages assigned yet.</p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {granted.map((k) => (
                      <Badge key={k} tone={admin.permissions![k] === "edit" ? "orange" : "gray"}>
                        {MODULES[k]} · {admin.permissions![k] === "edit" ? "edit" : "view"}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {admins.length === 0 && <p className="text-sm text-slate-500">No admins yet.</p>}
        </div>
      </Card>
    </Page>
  );
}
