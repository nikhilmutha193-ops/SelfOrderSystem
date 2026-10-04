import { Check, MapPin, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import type { Area } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { confirmDialog } from "../../../shared/ui/confirm";
import { Alert, Button, Card, CardHeader, ErrorText, IconButton, Input } from "../../../shared/ui/ui";
import { useSaveAreas } from "../queries";

interface DraftArea {
  key: string;
  _id?: string;
  name: string;
}

let nextKey = 1;
const toDraft = (areas: Area[]): DraftArea[] => areas.map((a) => ({ key: a._id, _id: a._id, name: a.name }));

export function AreasCard({ areas, canEdit }: { areas: Area[]; canEdit: boolean }) {
  const [draft, setDraft] = useState<DraftArea[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const save = useSaveAreas();
  const rows = draft ?? toDraft(areas);
  const dirty = draft !== null;

  function update(next: DraftArea[]) {
    setDraft(next);
    setSaved(false);
  }

  async function submit() {
    setError(null);
    const removed = areas.filter((a) => !rows.some((r) => r._id === a._id));
    if (
      removed.length > 0 &&
      !(await confirmDialog({
        title: `Remove ${removed.map((a) => a.name).join(", ")}?`,
        message: "Tables in it go back to no area, and its dish prices are deleted.",
        confirmLabel: "Remove",
      }))
    )
      return;
    try {
      await save.mutateAsync(rows.map((r) => ({ ...(r._id && { _id: r._id }), name: r.name.trim() })));
      setDraft(null);
      setSaved(true);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <Card>
      <CardHeader
        icon={MapPin}
        title="Areas"
        description="Group tables into areas like AC hall or rooftop. Each dish can have its own price per area."
      />
      <div className="flex flex-col gap-2">
        {rows.length === 0 && (
          <p className="text-sm text-slate-500">No areas yet. Every table uses the normal price.</p>
        )}
        {rows.map((row, index) => (
          <div key={row.key} className="flex items-center gap-2">
            <Input
              aria-label={`Area ${index + 1} name`}
              value={row.name}
              maxLength={40}
              disabled={!canEdit}
              placeholder="e.g. AC Hall"
              onChange={(e) => update(rows.map((r) => (r.key === row.key ? { ...r, name: e.target.value } : r)))}
            />
            {canEdit && (
              <IconButton
                icon={Trash2}
                label={`Remove ${row.name || "area"}`}
                className="!text-red-600 hover:!bg-red-50"
                onClick={() => update(rows.filter((r) => r.key !== row.key))}
              />
            )}
          </div>
        ))}
      </div>
      {canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            icon={Plus}
            onClick={() => update([...rows, { key: `new-${nextKey++}`, name: "" }])}
          >
            Add area
          </Button>
          {dirty && (
            <Button
              type="button"
              size="sm"
              icon={Check}
              loading={save.isPending}
              disabled={rows.some((r) => !r.name.trim())}
              onClick={submit}
            >
              Save areas
            </Button>
          )}
          {dirty && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>
              Discard
            </Button>
          )}
        </div>
      )}
      <div className="mt-3 flex flex-col gap-2">
        <ErrorText>{error}</ErrorText>
        {saved && !dirty && <Alert tone="success">Areas saved</Alert>}
      </div>
    </Card>
  );
}
