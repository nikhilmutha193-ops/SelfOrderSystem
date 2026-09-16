import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, extractErrorMessage } from "../../lib/apiClient";
import { Badge, Button, Card, ErrorText, Input, TableWrap } from "../../components/ui";
import type { TableRow } from "../../lib/types";

export default function Tables() {
  const [tables, setTables] = useState<TableRow[]>([]);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [newPin, setNewPin] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);

  function load() {
    api
      .get<TableRow[]>("/tables")
      .then((res) => setTables(res.data))
      .catch((err) => setError(extractErrorMessage(err)));
  }

  useEffect(load, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/tables", { code, password, isGuest });
      setCode("");
      setPassword("");
      setIsGuest(false);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function remove(table: TableRow) {
    if (!window.confirm(`Delete table "${table.code}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await api.delete(`/tables/${table._id}`);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function release(table: TableRow) {
    try {
      await api.patch(`/tables/${table._id}/release`);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  function startReset(table: TableRow) {
    setResettingId(table._id);
    setNewPin("");
    setResetError(null);
  }

  function cancelReset() {
    setResettingId(null);
    setNewPin("");
    setResetError(null);
  }

  async function submitReset(tableId: string) {
    if (!newPin) return;
    setResetError(null);
    try {
      await api.put(`/tables/${tableId}`, { password: newPin });
      setResettingId(null);
      setNewPin("");
      load();
    } catch (err) {
      setResetError(extractErrorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-800">Tables</h1>
      <Card>
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-slate-700">
            Table code
            <Input className="mt-1" placeholder="e.g. tbl1" value={code} onChange={(e) => setCode(e.target.value)} required />
          </label>
          <label className="text-sm font-medium text-slate-700">
            PIN
            <Input className="mt-1" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={isGuest} onChange={(e) => setIsGuest(e.target.checked)} />
            Guest table
          </label>
          <Button type="submit">Add table</Button>
        </form>
        <p className="mt-2 text-xs text-slate-500">
          A guest table is for walk-ins and the counter: it is never marked occupied, so several people can order
          from it at once and it never has to be released. They only give their name and mobile number.
        </p>
      </Card>

      <ErrorText>{error}</ErrorText>

      <Card>
        <TableWrap>
          <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="pb-2">Code</th>
              <th className="pb-2">PIN</th>
              <th className="pb-2">Type</th>
              <th className="pb-2">Status</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {tables.map((table) => (
              <tr key={table._id} className="border-t border-slate-100">
                <td className="py-1.5">{table.code}</td>
                <td className="py-1.5 font-mono">{table.password || "-"}</td>
                <td className="py-1.5">
                  {table.isGuest ? <Badge tone="blue">Guest</Badge> : <Badge tone="gray">Table</Badge>}
                </td>
                <td className="py-1.5">
                  {table.isGuest ? (
                    <span className="text-xs text-slate-400">shared</span>
                  ) : (
                    <Badge tone={table.status === "available" ? "green" : "amber"}>{table.status}</Badge>
                  )}
                </td>
                <td className="py-1.5">
                  {resettingId === table._id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        className="w-28"
                        placeholder="New PIN"
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value)}
                        autoFocus
                      />
                      <Button type="button" onClick={() => submitReset(table._id)} disabled={!newPin}>
                        Save
                      </Button>
                      <button className="text-slate-600 hover:underline" onClick={cancelReset}>
                        Cancel
                      </button>
                      {resetError && <span className="text-xs text-red-600">{resetError}</span>}
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      {table.status === "occupied" && !table.isGuest && (
                        <button className="text-slate-600 hover:underline" onClick={() => release(table)}>
                          Release
                        </button>
                      )}
                      <button className="text-orange-600 hover:underline" onClick={() => startReset(table)}>
                        Reset PIN
                      </button>
                      <Link className="text-orange-600 hover:underline" to={`/admin/kot?tableId=${table._id}`}>
                        View KOT
                      </Link>
                      <button className="text-red-600 hover:underline" onClick={() => remove(table)}>
                        Delete
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
