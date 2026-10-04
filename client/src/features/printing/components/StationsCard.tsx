import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import type { Station } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { confirmDialog } from "../../../shared/ui/confirm";
import { Button, Card, ErrorText, Input } from "../../../shared/ui/ui";
import { useCreateStation, useDeleteStation, useRenameStation } from "../queries";

function StationRow({ station, canEdit }: { station: Station; canEdit: boolean }) {
  const rename = useRenameStation();
  const remove = useDeleteStation();
  const [name, setName] = useState(station.name);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    try {
      await rename.mutateAsync({ id: station._id, name: name.trim() });
      setEditing(false);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function del() {
    if (
      !(await confirmDialog({
        title: `Remove ${station.name}?`,
        message: "Its dishes will print on the fallback printer instead.",
        confirmLabel: "Remove station",
      }))
    )
      return;
    setError(null);
    try {
      await remove.mutateAsync(station._id);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <li className="flex flex-col gap-1 border-t border-slate-100 py-2 first:border-t-0">
      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <Input
            aria-label="Station name"
            className="!w-auto flex-1"
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
        ) : (
          <span className="flex-1 font-medium text-slate-800">{station.name}</span>
        )}
        {canEdit &&
          (editing ? (
            <>
              <Button size="sm" onClick={save} disabled={rename.isPending || !name.trim()}>
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setName(station.name);
                }}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(true)}>
                Rename
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={Trash2}
                className="!text-red-600 hover:!bg-red-50"
                onClick={del}
                disabled={remove.isPending}
              >
                Remove
              </Button>
            </>
          ))}
      </div>
      <ErrorText>{error}</ErrorText>
    </li>
  );
}

export function StationsCard({ stations, canEdit }: { stations: Station[]; canEdit: boolean }) {
  const create = useCreateStation();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await create.mutateAsync(name.trim());
      setName("");
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <Card>
      <h2 className="text-base font-semibold text-slate-900">Kitchen stations</h2>
      <p className="mb-3 text-sm text-slate-500">
        Sections of the kitchen, like Hot Kitchen, Tandoor or Bar. Set a station on a category or dish and its KOT lines
        print at that station.
      </p>
      {stations.length === 0 ? (
        <p className="text-sm text-slate-400">No stations yet. Every KOT prints in full on the fallback printer.</p>
      ) : (
        <ul>
          {stations.map((station) => (
            <StationRow key={station._id} station={station} canEdit={canEdit} />
          ))}
        </ul>
      )}
      {canEdit && (
        <form className="mt-3 flex gap-2" onSubmit={add}>
          <Input
            id="station-name"
            placeholder="New station, e.g. Bar"
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" disabled={create.isPending || !name.trim()}>
            Add
          </Button>
        </form>
      )}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
