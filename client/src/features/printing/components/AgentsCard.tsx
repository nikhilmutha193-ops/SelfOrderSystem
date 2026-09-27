import { useState } from "react";

import type { PairingCode, PrintAgent } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { Badge, Button, Card, ErrorText, Input } from "../../../shared/ui/ui";
import { useCreateAgent, useRenewPairingCode, useRevokeAgent } from "../queries";

function lastSeen(agent: PrintAgent) {
  if (agent.online) return "";
  if (!agent.lastSeenAt) return "Never connected";
  return `Last seen ${new Date(agent.lastSeenAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`;
}

function PairingBox({ pairing, onClose }: { pairing: PairingCode; onClose: () => void }) {
  const server = window.location.origin;
  const command = `node agent.js pair --server ${server} --code ${pairing.pairingCode}`;
  return (
    <div className="mt-3 rounded-md border border-orange-200 bg-orange-50 p-3 text-sm" data-testid="pairing-box">
      <p className="font-medium text-slate-800">Pair “{pairing.name}”</p>
      <p className="mt-1 text-slate-600">
        On that computer, open the <code>print-agent</code> folder and run this within 15 minutes (until{" "}
        {new Date(pairing.expiresAt).toLocaleTimeString([], { timeStyle: "short" })}):
      </p>
      <p className="mt-2 text-center font-mono text-2xl font-bold tracking-[0.3em] text-slate-900">
        {pairing.pairingCode}
      </p>
      <pre className="mt-2 overflow-x-auto rounded bg-slate-900 px-3 py-2 text-xs text-slate-100">{command}</pre>
      <div className="mt-2 flex gap-2">
        <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(command)}>
          Copy command
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
                    onClick={() =>
                      window.confirm(`Remove ${agent.name}? Its printers stop printing until it is paired again.`) &&
                      run(() => revoke.mutateAsync(agent._id))
                    }
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
