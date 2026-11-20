import { useEffect, useState } from "react";

import { api, extractErrorMessage } from "../../shared/api/client";
import { confirmDialog } from "../../shared/ui/confirm";
import { Button, Card, ErrorText, Input, Select } from "../../shared/ui/ui";

interface DbConfig {
  connected: boolean;
  source: "env" | "admin" | null;
  hosts: string | null;
  database: string | null;
  user: string | null;
  masked: string | null;
  envConfigured: boolean;
  canSwitch: boolean;
}

interface ProbeResult {
  database: string;
  serverVersion: string | null;
  replicaSet: string | null;
  isReplicaSet: boolean;
  restaurantFound: boolean;
}

/** Owner-only: see which database the server uses, test another one, copy this restaurant to or from it, and switch. */
export default function DatabaseConnection() {
  const [config, setConfig] = useState<DbConfig | null>(null);
  const [uri, setUri] = useState("");
  const [password, setPassword] = useState("");
  const [direction, setDirection] = useState<"to" | "from">("to");
  const [overwrite, setOverwrite] = useState(false);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    try {
      setConfig((await api.get<DbConfig>("/db-config")).data);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function run(name: string, task: () => Promise<void>) {
    setError(null);
    setNotice(null);
    setBusy(name);
    try {
      await task();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const testConnection = () =>
    run("test", async () => {
      setProbe(null);
      setProbe((await api.post<ProbeResult>("/db-config/test", { uri })).data);
    });

  const copy = () =>
    run("copy", async () => {
      const toRemote = direction === "to";
      const ok = await confirmDialog({
        title: toRemote ? "Copy this restaurant to the other database?" : "Bring the other database's copy here?",
        message: toRemote
          ? "The restaurant, its logins, menu, orders and settings are copied there. Nothing changes here."
          : `The restaurant, its logins, menu, orders and settings here are ${overwrite ? "replaced by" : "joined by"} the other database's copy. Back up first. You may have to sign in again.`,
        confirmLabel: "Copy",
      });
      if (!ok) return;
      const res = await api.post<{ copied: Record<string, number> }>("/db-config/copy", {
        uri,
        direction,
        overwrite,
        password,
      });
      const total = Object.values(res.data.copied).reduce((sum, n) => sum + n, 0);
      setNotice(`Copied ${total} records across ${Object.keys(res.data.copied).length} collections.`);
      setPassword("");
    });

  const switchTo = () =>
    run("switch", async () => {
      const ok = await confirmDialog({
        title: "Switch the app to this database?",
        message:
          "Everyone now using the app moves to that database right away. Make sure it holds a current copy (use Copy first). The previous database is not touched.",
        confirmLabel: "Switch database",
      });
      if (!ok) return;
      await api.post("/db-config/switch", { uri, password });
      setNotice("Switched. The app is now using that database.");
      setPassword("");
      setUri("");
      setProbe(null);
      await load();
    });

  const useDefault = () =>
    run("env", async () => {
      const ok = await confirmDialog({
        title: "Go back to the server's own database?",
        message: "The app returns to the database set in the server's MONGO_URI and forgets the saved address.",
        confirmLabel: "Switch back",
      });
      if (!ok) return;
      await api.post("/db-config/use-env", { password });
      setNotice("Switched back to the server's own database.");
      setPassword("");
      await load();
    });

  return (
    <Card data-tour="backup-database">
      <h2 className="mb-3 text-base font-semibold text-slate-900">Database connection</h2>

      {config && (
        <dl className="mb-4 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div>
            <dt className="inline text-slate-500">Status: </dt>
            <dd className="inline font-medium text-slate-900">{config.connected ? "Connected" : "Not connected"}</dd>
          </div>
          <div>
            <dt className="inline text-slate-500">Set by: </dt>
            <dd className="inline text-slate-900">
              {config.source === "admin" ? "Saved here (this page)" : "The server's MONGO_URI setting"}
            </dd>
          </div>
          <div>
            <dt className="inline text-slate-500">Server: </dt>
            <dd className="inline break-all font-mono text-xs text-slate-900">{config.hosts ?? "-"}</dd>
          </div>
          <div>
            <dt className="inline text-slate-500">Database: </dt>
            <dd className="inline font-mono text-xs text-slate-900">
              {config.database ?? "-"}
              {config.user ? ` (user ${config.user})` : ""}
            </dd>
          </div>
        </dl>
      )}

      <p className="mb-3 text-sm text-slate-500">
        To move to another MongoDB server: paste its connection string, <strong>test</strong> it, <strong>copy</strong>{" "}
        this restaurant there, then <strong>switch</strong>. The new server must be a replica set (Atlas is). Use the
        copy in the other direction to bring data here from another server. The connection string is stored encrypted on
        the server and never shown again.
        {config && !config.canSwitch && " This host can't change the address; set MONGO_URI in its settings instead."}
      </p>

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Connection string
          <Input
            value={uri}
            onChange={(e) => {
              setUri(e.target.value);
              setProbe(null);
            }}
            placeholder="mongodb+srv://user:password@cluster.example.net/dbname"
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        {probe && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
            <p className="font-medium text-emerald-700">Connected to database "{probe.database}".</p>
            <ul className="mt-1 list-disc pl-5">
              {probe.serverVersion && <li>MongoDB {probe.serverVersion}</li>}
              <li className={probe.isReplicaSet ? "" : "text-red-700"}>
                {probe.isReplicaSet
                  ? `Replica set "${probe.replicaSet}": billing will work.`
                  : "Not a replica set: billing and purchases need one, so you can't switch to this."}
              </li>
              <li>
                {probe.restaurantFound
                  ? "This restaurant already exists there (you can switch, or copy with Replace)."
                  : "This restaurant isn't there yet: copy it first, then switch."}
              </li>
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Copy direction
            <Select
              className="!w-72"
              value={direction}
              onChange={(e) => setDirection(e.target.value as "to" | "from")}
            >
              <option value="to">Copy this restaurant to that database</option>
              <option value="from">Bring that database's copy here</option>
            </Select>
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
            Replace what is already at the destination
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Your admin password (needed to copy or switch)
          <Input
            type="password"
            className="!w-64"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>

        <ErrorText>{error}</ErrorText>
        {notice && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">{notice}</div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={testConnection} disabled={!uri || busy !== null}>
            {busy === "test" ? "Testing..." : "Test connection"}
          </Button>
          <Button variant="secondary" onClick={copy} disabled={!uri || !password || busy !== null}>
            {busy === "copy" ? "Copying..." : "Copy"}
          </Button>
          <Button
            variant="danger"
            onClick={switchTo}
            disabled={!uri || !password || busy !== null || config?.canSwitch === false}
          >
            {busy === "switch" ? "Switching..." : "Switch to this database"}
          </Button>
          {config?.source === "admin" && config.envConfigured && (
            <Button variant="secondary" onClick={useDefault} disabled={!password || busy !== null}>
              {busy === "env" ? "Switching..." : "Use the server's own database"}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
