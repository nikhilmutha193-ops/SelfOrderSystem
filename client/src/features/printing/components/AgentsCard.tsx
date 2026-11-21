import { Download } from "lucide-react";
import { useState } from "react";

import type { PairingCode, PrintAgent } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { confirmDialog } from "../../../shared/ui/confirm";
import { Badge, Button, Card, ErrorText, Input } from "../../../shared/ui/ui";
import { printingApi } from "../api";
import { useAgentDownloads, useCreateAgent, useRenewPairingCode, useRevokeAgent } from "../queries";

function lastSeen(agent: PrintAgent) {
  if (agent.online) return "";
  if (!agent.lastSeenAt) return "Never connected";
  return `Last seen ${new Date(agent.lastSeenAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`;
}

const mb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1048576))} MB`;

/** The two ways to get the agent onto the printing computer: the single-file Windows app, or the folder to run with Node.js. */
function DownloadAgent({ onError }: { onError: (message: string | null) => void }) {
  const { data } = useAgentDownloads();
  const [busy, setBusy] = useState<"zip" | "exe" | null>(null);

  async function get(kind: "zip" | "exe") {
    onError(null);
    setBusy(kind);
    try {
      await (kind === "zip" ? printingApi.downloadAgentZip() : printingApi.downloadAgentExe());
    } catch (err) {
      onError(extractErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const exeReady = !!data?.exe.available;
  return (
    <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm" data-testid="agent-downloads">
      <p className="font-medium text-slate-800">Get the print agent</p>
      <p className="mt-0.5 text-slate-500">Download it, copy it to the printing computer, then pair it with a code below.</p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 rounded-md border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Windows app</p>
          <Button
            variant="secondary"
            icon={Download}
            className="w-full justify-center"
            disabled={!exeReady || busy !== null}
            loading={busy === "exe"}
            onClick={() => get("exe")}
          >
            Download PrintAgent.zip
          </Button>
          <p className="text-xs text-slate-500">
            {exeReady
              ? `No Node.js needed. Extract All, open PrintAgent.exe, type the pairing code and press Set up and start (the exe is about ${mb(data!.exe.sizeBytes)}).`
              : "Not on this server yet. Build it with node build-exe.js and copy it to the server's downloads folder (see downloads/README.md)."}
          </p>
        </div>
        <div className="flex flex-col gap-1.5 rounded-md border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Agent folder</p>
          <Button
            variant="secondary"
            icon={Download}
            className="w-full justify-center"
            disabled={busy !== null}
            loading={busy === "zip"}
            onClick={() => get("zip")}
          >
            Download print-agent.zip
          </Button>
          <p className="text-xs text-slate-500">
            Needs Node.js 18 or newer on that computer. Extract All, then run node agent.js in the folder to open the same setup window.
          </p>
        </div>
      </div>
    </div>
  );
}

function PairingBox({ pairing, onClose }: { pairing: PairingCode; onClose: () => void }) {
  const server = window.location.origin;
  // For people who prefer a command line: the same pairing, without the setup window.
  const exeCommand = `PrintAgent.exe pair --server ${server} --code ${pairing.pairingCode}`;
  return (
    <div className="mt-3 rounded-md border border-orange-200 bg-orange-50 p-3 text-sm" data-testid="pairing-box">
      <p className="font-medium text-slate-800">Pair “{pairing.name}”</p>
      <p className="mt-1 text-slate-600">
        On that computer, open <b>PrintAgent.exe</b> and type this code within 15 minutes (until{" "}
        {new Date(pairing.expiresAt).toLocaleTimeString([], { timeStyle: "short" })}), then press{" "}
        <b>Set up and start</b>:
      </p>
      <p className="mt-2 text-center font-mono text-2xl font-bold tracking-[0.3em] text-slate-900">
        {pairing.pairingCode}
      </p>
      <p className="mt-2 text-center text-xs text-slate-600">
        Server address (already filled in if you downloaded the app from here): <b>{server}</b>
      </p>
      <details className="mt-2 text-xs text-slate-600">
        <summary className="cursor-pointer font-medium">Command line instead</summary>
        <pre className="mt-1 overflow-x-auto rounded bg-slate-900 px-3 py-2 text-slate-100">{exeCommand}</pre>
        <p className="mt-1">Pairs only. Start it with: PrintAgent.exe run</p>
      </details>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(pairing.pairingCode)}>
          Copy code
        </Button>
        <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(server)}>
          Copy server address
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

export function AgentsCard({ agents, canEdit }: { agents: PrintAgent[]; canEdit: boolean }) {
  const create = useCreateAgent();
  const renew = useRenewPairingCode();
  const revoke = useRevokeAgent();
  const [name, setName] = useState("");
  const [pairing, setPairing] = useState<PairingCode | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(action: () => Promise<T>, after?: (result: T) => void) {
    setError(null);
    try {
      after?.(await action());
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <Card>
      <h2 className="text-base font-semibold text-slate-900">Print computers</h2>
      <p className="mb-3 text-sm text-slate-500">
        One computer in the restaurant runs the print agent and sends tickets to the printers. Keep it switched on
        during service.
      </p>
      {canEdit && <DownloadAgent onError={setError} />}
      {agents.length === 0 ? (
        <p className="text-sm text-slate-400">No computer added yet.</p>
      ) : (
        <ul>
          {agents.map((agent) => (
            <li
              key={agent._id}
              className="flex flex-col gap-2 border-t border-slate-100 py-3 first:border-t-0 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900">{agent.name}</span>
                  {!agent.paired ? (
                    <Badge tone="amber" dot>
                      Waiting to pair
                    </Badge>
                  ) : (
                    <Badge tone={agent.online ? "green" : "red"} dot>
                      {agent.online ? "Online" : "Offline"}
                    </Badge>
                  )}
                </div>
                {agent.paired && <p className="mt-0.5 text-xs text-slate-500">{lastSeen(agent)}</p>}
              </div>
              {canEdit && (
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={renew.isPending}
                    onClick={() => run(() => renew.mutateAsync(agent._id), setPairing)}
                  >
                    {agent.paired ? "Pair again" : "New code"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="!text-red-600 hover:!bg-red-50"
                    disabled={revoke.isPending}
                    onClick={async () => {
                      const ok = await confirmDialog({
                        title: `Remove ${agent.name}?`,
                        message: "Its printers stop printing until a computer is paired again.",
                        confirmLabel: "Remove computer",
                      });
                      if (ok) run(() => revoke.mutateAsync(agent._id));
                    }}
                  >
                    Remove
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => create.mutateAsync(name.trim()),
              (result) => {
                setPairing(result);
                setName("");
              }
            );
          }}
        >
          <Input
            id="agent-name"
            placeholder="Computer name, e.g. Billing counter"
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" disabled={create.isPending || !name.trim()}>
            Add computer
          </Button>
        </form>
      )}
      {pairing && <PairingBox pairing={pairing} onClose={() => setPairing(null)} />}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
