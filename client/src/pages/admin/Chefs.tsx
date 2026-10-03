import { ChefHat, KeyRound, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { useSetChefStation, useStationList } from "../../features/printing/queries";
import type { ChefRow } from "../../lib/types";
import { api, extractErrorMessage } from "../../shared/api/client";
import { confirmDialog } from "../../shared/ui/confirm";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorText,
  Field,
  Input,
  Page,
  PageHeader,
  Select,
  TableWrap,
} from "../../shared/ui/ui";

export default function Chefs() {
  const [chefs, setChefs] = useState<ChefRow[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const stations = useStationList();
  const setChefStation = useSetChefStation();

  async function changeStation(chef: ChefRow, stationId: string) {
    setError(null);
    try {
      await setChefStation.mutateAsync({ chefId: chef._id, stationId: stationId || null });
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

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
    if (
      !(await confirmDialog({
        title: `Remove chef ${chef.username}?`,
        message: "They are signed out of the kitchen display straight away.",
        confirmLabel: "Remove chef",
      }))
    )
      return;
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
    <Page>
      <PageHeader
        title="Chef Accounts"
        description="Logins for the kitchen display. A chef with a station sees that station's tickets first."
      />
      <Card>
        <CardHeader icon={Plus} title="Add a chef" />
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Username" htmlFor="chef-username">
            <Input
              id="chef-username"
              autoComplete="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </Field>
          <Field label="Password" htmlFor="chef-password">
            <Input
              id="chef-password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={4}
            />
          </Field>
          <Button type="submit" icon={Plus}>
            Add chef
          </Button>
        </form>
      </Card>

      <ErrorText>{error}</ErrorText>

      <Card>
        <CardHeader
          title="Kitchen staff"
          description={`${chefs.length} account${chefs.length === 1 ? "" : "s"}`}
          className="mb-3"
        />
        {chefs.length === 0 ? (
          <EmptyState
            icon={ChefHat}
            title="No chef accounts yet"
            description="Add one above so the kitchen can sign in."
          />
        ) : (
          <TableWrap>
            <table className="min-w-[34rem]">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Password</th>
                  {stations.length > 0 && <th>Station</th>}
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {chefs.map((chef) => (
                  <tr key={chef._id}>
                    <td className="font-medium text-slate-900">{chef.username}</td>
                    <td className="font-mono text-slate-600">{chef.password || "—"}</td>
                    {stations.length > 0 && (
                      <td>
                        <Select
                          aria-label={`Station for ${chef.username}`}
                          className="!w-44"
                          value={chef.stationId ?? ""}
                          disabled={setChefStation.isPending}
                          onChange={(e) => changeStation(chef, e.target.value)}
                        >
                          <option value="">All stations</option>
                          {stations.map((station) => (
                            <option key={station._id} value={station._id}>
                              {station.name}
                            </option>
                          ))}
                        </Select>
                      </td>
                    )}
                    <td className="text-right">
                      {resettingId === chef._id ? (
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Input
                            className="!w-40"
                            placeholder="New password"
                            aria-label={`New password for ${chef.username}`}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            autoFocus
                          />
                          <Button type="button" size="sm" onClick={() => submitReset(chef._id)} disabled={!newPassword}>
                            Save
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={cancelReset}>
                            Cancel
                          </Button>
                          {resetError && <span className="w-full text-xs text-red-600">{resetError}</span>}
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1 whitespace-nowrap">
                          <Button size="sm" variant="ghost" icon={KeyRound} onClick={() => startReset(chef)}>
                            Reset password
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={Trash2}
                            className="!text-red-600 hover:!bg-red-50"
                            onClick={() => remove(chef)}
                          >
                            Remove
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </Page>
  );
}
