import { useState } from "react";

import { extractErrorMessage } from "../api/client";
import { Button, ErrorText, Select, Textarea } from "./ui";

export interface ReasonOption<T extends string> {
  value: T;
  label: string;
}

interface ReasonDialogProps<T extends string> {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  danger?: boolean;
  options?: ReasonOption<T>[];
  noteRequired?: boolean;
  onCancel: () => void;
  onConfirm: (result: { option?: T; note: string }) => Promise<void>;
}

export default function ReasonDialog<T extends string>(props: ReasonDialogProps<T>) {
  if (!props.open) return null;
  return <ReasonDialogForm {...props} />;
}

function ReasonDialogForm<T extends string>({
  title,
  description,
  confirmLabel,
  danger = false,
  options,
  noteRequired = !options,
  onCancel,
  onConfirm,
}: ReasonDialogProps<T>) {
  const [option, setOption] = useState<T | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (options && !option) return setError("Choose a reason");
    if (noteRequired && note.trim().length < 3) return setError("Write a short reason");
    setBusy(true);
    setError(null);
    try {
      await onConfirm({ option: option || undefined, note: note.trim() });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onCancel}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col gap-3 rounded-xl bg-white p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reason-dialog-title"
      >
        <h2 id="reason-dialog-title" className="text-lg font-semibold text-slate-800">
          {title}
        </h2>
        {description && <p className="text-sm text-slate-600">{description}</p>}
        {options && (
          <label className="text-sm font-medium text-slate-700">
            Reason
            <Select
              id="reason-dialog-option"
              className="mt-1"
              value={option}
              onChange={(e) => setOption(e.target.value as T)}
            >
              <option value="">Choose a reason</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </label>
        )}
        <label className="text-sm font-medium text-slate-700">
          {options ? "Note (optional)" : "Reason"}
          <Textarea
            id="reason-dialog-note"
            className="mt-1"
            rows={3}
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={options ? "Anything the owner should know" : "Why is this needed?"}
          />
        </label>
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
            Keep as is
          </Button>
          <Button type="submit" variant={danger ? "danger" : "primary"} disabled={busy}>
            {busy ? "Saving..." : confirmLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}
