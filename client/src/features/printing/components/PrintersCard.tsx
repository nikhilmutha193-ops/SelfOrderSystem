import { Pencil, Printer as PrinterIcon, Trash2 } from "lucide-react";
import { useState } from "react";

import type { PrintAgent, Printer, PrinterInput, Station } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { confirmDialog } from "../../../shared/ui/confirm";
import { Badge, Button, Card, ErrorText, Input, Select } from "../../../shared/ui/ui";
import { useCreatePrinter, useDeletePrinter, useTestPrinter, useUpdatePrinter } from "../queries";

function blankPrinter(agents: PrintAgent[]): PrinterInput {
  return {
    name: "",
    agentId: agents[0]?._id ?? "",
    connection: { type: "network", host: "", port: 9100 },
    paperWidth: 80,
    printsBills: false,
    printsUnroutedKots: false,
    stationIds: [],
    isActive: true,
  };
}

function toInput(printer: Printer): PrinterInput {
  const { _id: _unused, ...rest } = printer;
  return { ...rest, stationIds: rest.stationIds.map(String), agentId: String(rest.agentId) };
}

function PrinterForm({
  initial,
  agents,
  stations,
  saving,
  onSave,
  onCancel,
}: {
  initial: PrinterInput;
  agents: PrintAgent[];
  stations: Station[];
  saving: boolean;
  onSave: (input: PrinterInput) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<PrinterInput>(initial);
  const set = (patch: Partial<PrinterInput>) => setForm((f) => ({ ...f, ...patch }));
  const toggleStation = (id: string) =>
    set({
      stationIds: form.stationIds.includes(id) ? form.stationIds.filter((s) => s !== id) : [...form.stationIds, id],
    });

  return (
    <form
      className="mt-3 flex flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(
          form.connection.type === "network" && !form.connection.port
            ? { ...form, connection: { ...form.connection, port: 9100 } }
            : form
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Printer name
          <Input
            id="printer-name"
            className="mt-1"
            placeholder="e.g. Kitchen printer"
            maxLength={40}
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Connected to computer
          <Select
            id="printer-agent"
            className="mt-1"
            value={form.agentId}
            onChange={(e) => set({ agentId: e.target.value })}
          >
            {agents.map((agent) => (
              <option key={agent._id} value={agent._id}>
                {agent.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Connection
          <Select
            id="printer-connection"
            className="mt-1"
            value={form.connection.type}
            onChange={(e) =>
              set({
                connection:
                  e.target.value === "network"
                    ? { type: "network", host: "", port: 9100 }
                    : { type: "shared", shareName: "" },
              })
            }
          >
            <option value="network">Network (LAN / Wi-Fi)</option>
            <option value="shared">USB, shared in Windows</option>
          </Select>
        </label>
        {form.connection.type === "network" ? (
          <div className="flex gap-2">
            <label className="flex-1 text-sm font-medium text-slate-700">
              IP address
              <Input
                id="printer-host"
                className="mt-1"
                placeholder="192.168.1.50"
                value={form.connection.host}
                onChange={(e) =>
                  form.connection.type === "network" &&
                  set({ connection: { ...form.connection, host: e.target.value } })
                }
              />
            </label>
            <label className="w-24 text-sm font-medium text-slate-700">
              Port
              <Input
                id="printer-port"
                className="mt-1"
                type="number"
                min={1}
                max={65535}
                value={form.connection.port || ""}
                onChange={(e) =>
                  form.connection.type === "network" &&
                  set({ connection: { ...form.connection, port: Number(e.target.value) || 0 } })
                }
              />
            </label>
          </div>
        ) : (
          <label className="text-sm font-medium text-slate-700">
            Windows share name
            <Input
              id="printer-share"
              className="mt-1"
              placeholder="e.g. POS80"
              value={form.connection.shareName}
              onChange={(e) => set({ connection: { type: "shared", shareName: e.target.value } })}
            />
          </label>
        )}
        <label className="text-sm font-medium text-slate-700">
          Paper width
          <Select
            id="printer-width"
            className="mt-1"
            value={form.paperWidth}
            onChange={(e) => set({ paperWidth: Number(e.target.value) as 58 | 80 })}
          >
            <option value={80}>80 mm</option>
            <option value={58}>58 mm</option>
          </Select>
        </label>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-slate-700">Prints KOTs for</legend>
        {stations.length === 0 ? (
          <p className="text-sm text-slate-400">Add kitchen stations above to route KOT lines.</p>
        ) : (
          <div className="mt-1 flex flex-wrap gap-3">
            {stations.map((station) => (
              <label key={station._id} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.stationIds.includes(station._id)}
                  onChange={() => toggleStation(station._id)}
                />
                {station.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <div className="flex flex-col gap-2 text-sm text-slate-700">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.printsUnroutedKots}
            onChange={(e) => set({ printsUnroutedKots: e.target.checked })}
          />
          Prints KOTs without a station (fallback)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.printsBills} onChange={(e) => set({ printsBills: e.target.checked })} />
          Prints bills
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
          In use
        </label>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={saving || !form.name.trim() || !form.agentId}>
          Save printer
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function PrintersCard({
  printers,
  agents,
  stations,
  canEdit,
}: {
  printers: Printer[];
  agents: PrintAgent[];
  stations: Station[];
  canEdit: boolean;
}) {
  const create = useCreatePrinter();
  const update = useUpdatePrinter();
  const remove = useDeletePrinter();
  const test = useTestPrinter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const agentName = new Map(agents.map((a) => [a._id, a.name]));
  const stationName = new Map(stations.map((s) => [s._id, s.name]));

  async function run(action: () => Promise<unknown>, done?: string) {
    setError(null);
    setNotice(null);
    try {
      await action();
      if (done) setNotice(done);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Printers</h2>
          <p className="text-sm text-slate-500">ESC/POS thermal printers, 58 mm or 80 mm.</p>
        </div>
        {canEdit && editing === null && (
          <Button onClick={() => setEditing("new")} disabled={agents.length === 0}>
            Add printer
          </Button>
        )}
      </div>
      {canEdit && agents.length === 0 && (
        <p className="mt-2 text-sm text-amber-700">Add a print computer first, then add its printers.</p>
      )}

      {editing === "new" && (
        <PrinterForm
          initial={blankPrinter(agents)}
          agents={agents}
          stations={stations}
          saving={create.isPending}
          onCancel={() => setEditing(null)}
          onSave={(input) => run(() => create.mutateAsync(input).then(() => setEditing(null)))}
        />
      )}

      <ul className="mt-3">
        {printers.map((printer) =>
          editing === printer._id ? (
            <li key={printer._id}>
              <PrinterForm
                initial={toInput(printer)}
                agents={agents}
                stations={stations}
                saving={update.isPending}
                onCancel={() => setEditing(null)}
                onSave={(input) =>
                  run(() => update.mutateAsync({ id: printer._id, input }).then(() => setEditing(null)))
                }
              />
            </li>
          ) : (
            <li
              key={printer._id}
              className="flex flex-wrap items-center gap-2 border-t border-slate-100 py-2 first:border-t-0"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-800">
                  {printer.name} {!printer.isActive && <Badge tone="gray">Not in use</Badge>}
                </p>
                <p className="text-xs text-slate-500">
                  {printer.connection.type === "network"
                    ? `${printer.connection.host}:${printer.connection.port}`
                    : `Shared as ${printer.connection.shareName}`}{" "}
                  · {printer.paperWidth} mm · via {agentName.get(String(printer.agentId)) ?? "removed computer"}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {printer.stationIds.map((id) => (
                    <Badge key={id} tone="blue">
                      {stationName.get(String(id)) ?? "Removed station"}
                    </Badge>
                  ))}
                  {printer.printsUnroutedKots && <Badge tone="amber">Fallback KOTs</Badge>}
                  {printer.printsBills && <Badge tone="green">Bills</Badge>}
                </div>
              </div>
              {canEdit && (
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={PrinterIcon}
                    disabled={test.isPending}
                    onClick={() => run(() => test.mutateAsync(printer._id), `Test page sent to ${printer.name}`)}
                  >
                    Test
                  </Button>
                  <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(printer._id)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Trash2}
                    className="!text-red-600 hover:!bg-red-50"
                    disabled={remove.isPending}
                    onClick={async () => {
                      const ok = await confirmDialog({
                        title: `Remove ${printer.name}?`,
                        message: "Tickets for it go to the fallback printer, or open as PDFs if there is none.",
                        confirmLabel: "Remove printer",
                      });
                      if (ok) run(() => remove.mutateAsync(printer._id));
                    }}
                  >
                    Remove
                  </Button>
                </div>
              )}
            </li>
          )
        )}
        {printers.length === 0 && editing !== "new" && <li className="text-sm text-slate-400">No printers yet.</li>}
      </ul>
      {notice && <p className="mt-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</p>}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
