import { useEffect, useState } from "react";
import { api, extractErrorMessage } from "../../lib/apiClient";
import { Badge, Button, Card, ErrorText, Input, Select } from "../../components/ui";
import {
  MODULES,
  MODULE_KEYS,
  useAdmin,
  type AdminProfile,
  type ModuleKey,
  type PermissionLevel,
} from "../../lib/adminAuth";

type Permissions = Partial<Record<ModuleKey, PermissionLevel>>;

const LEVEL_OPTIONS: { value: "" | PermissionLevel; label: string }[] = [
  { value: "", label: "No access" },
  { value: "view", label: "View only" },
  { value: "edit", label: "View & edit" },
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
    <div className="grid gap-2 sm:grid-cols-2">
      {MODULE_KEYS.map((key) => (
        <label key={key} className="flex items-center justify-between gap-3 rounded border border-slate-200 px-3 py-2">
          <span className="text-sm text-slate-700">{MODULES[key]}</span>
          <Select
            className="w-36"
            disabled={disabled}
            value={value[key] ?? ""}
            onChange={(e) => {
              const level = e.target.value as "" | PermissionLevel;
              const next = { ...value };
              if (level === "") delete next[key];
              else next[key] = level;
              onChange(next);
            }}
          >
            {LEVEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </label>
      ))}
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
    if (!window.confirm(`Delete admin "${name}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await api.delete(`/admins/${id}`);
      setMessage("Admin deleted");
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-800">Admin Users</h1>
      <ErrorText>{error}</ErrorText>
      {message && <p className="text-sm text-green-700">{message}</p>}

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-slate-800">Add an admin</h2>
        <form onSubmit={createAdmin} className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Username
              <Input className="mt-1" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Password
              <Input
                className="mt-1"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </label>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Module access</p>
            <PermissionGrid value={newPermissions} onChange={setNewPermissions} />
          </div>
          <Button type="submit" disabled={creating}>
            {creating ? "Creating..." : "Create admin"}
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-slate-800">Existing admins</h2>
        <div className="flex flex-col gap-4">
          {admins.map((admin) => (
            <div key={admin.id} className="rounded border border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-800">{admin.username}</span>
                  {admin.isOwner && <Badge tone="blue">Owner</Badge>}
                  {admin.id === profile?.id && <Badge tone="gray">You</Badge>}
                </div>
                <div className="flex gap-2">
                  {!admin.isOwner && (
                    <Button
                      type="button"
                      onClick={() => {
                        setEditingId(editingId === admin.id ? null : admin.id);
                        setDraft(admin.permissions ?? {});
                      }}
                    >
                      {editingId === admin.id ? "Cancel" : "Edit access"}
                    </Button>
                  )}
                  {!admin.isOwner && admin.id !== profile?.id && (
                    <Button type="button" onClick={() => removeAdmin(admin.id, admin.username)}>
                      Delete
                    </Button>
                  )}
                </div>
              </div>

              {admin.isOwner ? (
                <p className="mt-2 text-sm text-slate-500">The owner account always has full access.</p>
              ) : editingId === admin.id ? (
                <div className="mt-3 flex flex-col gap-3">
                  <PermissionGrid value={draft} onChange={setDraft} />
                  <Button type="button" onClick={() => savePermissions(admin.id)}>
                    Save permissions
                  </Button>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">
                  {MODULE_KEYS.filter((k) => admin.permissions?.[k]).length === 0
                    ? "No modules assigned yet."
                    : MODULE_KEYS.filter((k) => admin.permissions?.[k])
                        .map((k) => `${MODULES[k]} (${admin.permissions![k]})`)
                        .join(", ")}
                </p>
              )}
            </div>
          ))}
          {admins.length === 0 && <p className="text-sm text-slate-500">No admins yet.</p>}
        </div>
      </Card>
    </div>
  );
}
