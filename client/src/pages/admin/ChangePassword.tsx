import { KeyRound } from "lucide-react";
import { useState } from "react";

import { api, extractErrorMessage, setActiveAuth, storeToken } from "../../shared/api/client";
import { Alert, Button, Card, CardHeader, ErrorText, Field, Input, Page, PageHeader } from "../../shared/ui/ui";

export default function ChangePassword() {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      const res = await api.post<{ token?: string }>("/auth/admin/change-password", { oldPassword, newPassword });
      if (res.data.token) {
        storeToken("admin", res.data.token);
        setActiveAuth({ role: "admin", token: res.data.token });
      }
      setMessage("Password updated. Other devices using this account have been signed out.");
      setOldPassword("");
      setNewPassword("");
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <Page className="max-w-xl">
      <PageHeader title="Change password" description="Other devices signed in to this account will be signed out." />
      <Card>
        <CardHeader icon={KeyRound} title="Update your password" />
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Current password" htmlFor="current-password">
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              required
            />
          </Field>
          <Field label="New password" htmlFor="new-password" hint="At least 6 characters.">
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
            />
          </Field>
          <ErrorText>{error}</ErrorText>
          {message && <Alert tone="success">{message}</Alert>}
          <Button type="submit" className="self-start">
            Update password
          </Button>
        </form>
      </Card>
    </Page>
  );
}
