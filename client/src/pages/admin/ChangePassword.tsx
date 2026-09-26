import { useState } from "react";

import { api, extractErrorMessage, setActiveAuth, storeToken } from "../../shared/api/client";
import { Button, Card, ErrorText, Input } from "../../shared/ui/ui";

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
    <div className="flex max-w-md flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-800">Change Password</h1>
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="text-sm font-medium text-slate-700">
            Current password
            <Input
              className="mt-1"
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              required
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            New password
            <Input
              className="mt-1"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
            />
          </label>
          <ErrorText>{error}</ErrorText>
          {message && <p className="text-sm text-green-700">{message}</p>}
          <Button type="submit">Update password</Button>
        </form>
      </Card>
    </div>
  );
}
