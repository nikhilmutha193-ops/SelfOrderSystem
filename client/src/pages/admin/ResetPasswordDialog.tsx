import { Check, Copy, Eye, EyeOff, Wand2 } from "lucide-react";
import { useState } from "react";

import { api, extractErrorMessage } from "../../shared/api/client";
import { Dialog } from "../../shared/ui/Dialog";
import { Button, ErrorText, Field, Input } from "../../shared/ui/ui";

const CHARS = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generatePassword(length = 10) {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => CHARS[n % CHARS.length]).join("");
}

/**
 * Sets a new password for another staff login. Passwords are stored only as hashes, so the old one can
 * never be shown; the admin sees the new one here, once, to hand it over.
 */
export function ResetPasswordDialog({
  admin,
  onClose,
  onDone,
}: {
  admin: { id: string; username: string } | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPassword, setSavedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function close() {
    if (savedPassword) onDone(`Password reset for ${admin?.username}`);
    setPassword("");
    setVisible(true);
    setError(null);
    setSavedPassword(null);
    setCopied(false);
    onClose();
  }

  async function submit() {
    if (!admin) return;
    if (password.length < 6) return setError("The password must be at least 6 characters");
    setSaving(true);
    setError(null);
    try {
      await api.put(`/admins/${admin.id}/password`, { newPassword: password });
      setSavedPassword(password);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    if (!savedPassword) return;
    try {
      await navigator.clipboard.writeText(savedPassword);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Dialog
      open={!!admin}
      onClose={close}
      title={savedPassword ? "Password reset" : `Reset password for ${admin?.username ?? ""}`}
      description={
        savedPassword
          ? "Give this password to them now. It is not stored in a readable form, so it can't be shown again."
          : "They are signed out everywhere and must use the new password."
      }
      onSubmit={savedPassword ? undefined : submit}
      footer={
        savedPassword ? (
          <Button type="button" onClick={close}>
            Done
          </Button>
        ) : (
          <>
            <Button type="button" variant="secondary" onClick={close} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Reset password
            </Button>
          </>
        )
      }
    >
      {savedPassword ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
          <code className="break-all text-lg font-semibold tracking-wide text-slate-900">{savedPassword}</code>
          <Button type="button" size="sm" variant="secondary" icon={copied ? Check : Copy} onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Field label="New password" htmlFor="reset-password" hint="At least 6 characters.">
            <div className="flex gap-2">
              <Input
                id="reset-password"
                type={visible ? "text" : "password"}
                autoComplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
              <Button
                type="button"
                variant="secondary"
                aria-label={visible ? "Hide password" : "Show password"}
                icon={visible ? EyeOff : Eye}
                onClick={() => setVisible((v) => !v)}
              />
            </div>
          </Field>
          <Button
            type="button"
            size="sm"
            variant="soft"
            icon={Wand2}
            className="self-start"
            onClick={() => {
              setPassword(generatePassword());
              setVisible(true);
            }}
          >
            Generate a password
          </Button>
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </Dialog>
  );
}
