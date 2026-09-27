import { useState } from "react";

import { extractErrorMessage } from "../api/client";
import { Dialog } from "./Dialog";
import { Button, ErrorText, Field, Select, Textarea } from "./ui";

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
    <Dialog
      open
      onClose={onCancel}
      title={title}
      description={description}
      onSubmit={submit}
      dismissible={!busy}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
            Keep as is
          </Button>
          <Button type="submit" variant={danger ? "danger" : "primary"} loading={busy}>
            {busy ? "Saving..." : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {options && (
          <Field label="Reason" htmlFor="reason-dialog-option">
            <Select id="reason-dialog-option" value={option} onChange={(e) => setOption(e.target.value as T)}>
              <option value="">Choose a reason</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={options ? "Note (optional)" : "Reason"} htmlFor="reason-dialog-note">
          <Textarea
            id="reason-dialog-note"
            rows={3}
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={options ? "Anything the owner should know" : "Why is this needed?"}
          />
        </Field>
        <ErrorText>{error}</ErrorText>
      </div>
    </Dialog>
  );
}
