import { useEffect, useState } from "react";
import { api, extractErrorMessage } from "../../lib/apiClient";
import { Button, Card, ErrorText, Input, TableWrap } from "../../components/ui";
import type { ChefRow } from "../../lib/types";

export default function Chefs() {
  const [chefs, setChefs] = useState<ChefRow[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);

  function load() {
    api
      .get<ChefRow[]>("/chefs")
      .then((res) => setChefs(res.data))
      .catch((err) => setError(extractErrorMessage(err)));
  }

  useEffect(load, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/chefs", { username, password });
      setUsername("");
      setPassword("");
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function remove(chef: ChefRow) {
    if (!confirm(`Remove chef "${chef.username}"?`)) return;
    try {
      await api.delete(`/chefs/${chef._id}`);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  function startReset(chef: ChefRow) {
    setResettingId(chef._id);
    setNewPassword("");
    setResetError(null);
  }

  function cancelReset() {
    setResettingId(null);
    setNewPassword("");
    setResetError(null);
  }

  async function submitReset(chefId: string) {
    if (newPassword.length < 4) {
      setResetError("password must be at least 4 characters");
      return;
    }
    setResetError(null);
    try {
      await api.put(`/chefs/${chefId}`, { password: newPassword });
      setResettingId(null);
      setNewPassword("");
      load();
    } catch (err) {
      setResetError(extractErrorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-800">Chef Accounts</h1>
      <Card>
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-slate-700">
            Username
            <Input className="mt-1" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Password
            <Input className="mt-1" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={4} />
          </label>
          <Button type="submit">Add chef</Button>
        </form>
      </Card>

      <ErrorText>{error}</ErrorText>

      <Card>
        <TableWrap>
          <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="pb-2">Username</th>
              <th className="pb-2">Password</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {chefs.map((chef) => (
              <tr key={chef._id} className="border-t border-slate-100">
                <td className="py-1.5">{chef.username}</td>
                <td className="py-1.5 font-mono">{chef.password || "-"}</td>
                <td className="py-1.5">
                  {resettingId === chef._id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        className="w-36"
                        placeholder="New password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        autoFocus
                      />
                      <Button type="button" onClick={() => submitReset(chef._id)} disabled={!newPassword}>
                        Save
                      </Button>
                      <button className="text-slate-600 hover:underline" onClick={cancelReset}>
                        Cancel
                      </button>
                      {resetError && <span className="text-xs text-red-600">{resetError}</span>}
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <button className="text-orange-600 hover:underline" onClick={() => startReset(chef)}>
                        Reset password
                      </button>
                      <button className="text-red-600 hover:underline" onClick={() => remove(chef)}>
                        Remove
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      </Card>
    </div>
  );
}
