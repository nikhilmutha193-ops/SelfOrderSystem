import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, activateStoredAuth, storeToken, setActiveAuth, extractErrorMessage, wasSessionExpired, clearExpiredFlag } from "../../lib/apiClient";
import { Button, Card, ErrorText, Input } from "../../components/ui";
import type { TableRow } from "../../lib/types";
import { useTableSession } from "../../lib/useTableSession";

export default function TableLogin() {
  const [searchParams] = useSearchParams();
  const qrToken = searchParams.get("t") || "";
  const [sessionExpired] = useState(() => searchParams.get("expired") === "1" || wasSessionExpired("table"));
  const [code, setCode] = useState(() => searchParams.get("code") || "");
  const [password, setPassword] = useState("");
  const [available, setAvailable] = useState<TableRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const session = useTableSession();

  async function loginWithQrToken() {
    setError(null);
    setLoading(true);
    try {
      const res = await api.post("/auth/table/login", { token: qrToken });
      storeToken("table", res.data.token);
      setActiveAuth({ role: "table", token: res.data.token });
      navigate("/order/details");
    } catch (err) {
      setError(extractErrorMessage(err));
      setLoading(false);
    }
  }

  useEffect(() => {
    // Resume only on a token that survived activation - a dead one still decodes,
    // which would bounce the guest straight back into a session that can't work.
    clearExpiredFlag("table"); // consumed by the notice above
    const token = activateStoredAuth("table");
    if (token && !sessionExpired) {
      if (session.orderId) navigate("/order/menu", { replace: true });
      else if (session.tableId) navigate("/order/details", { replace: true });
    }

    if (qrToken) {
      loginWithQrToken();
    } else {
      api
        .get<TableRow[]>("/tables/available")
        .then((res) => setAvailable(res.data))
        .catch(() => setAvailable([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post("/auth/table/login", { code, password });
      storeToken("table", res.data.token);
      setActiveAuth({ role: "table", token: res.data.token });
      navigate("/order/details");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (qrToken) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-800">Welcome</h1>
        </div>
        <Card>
          {error ? (
            <div className="flex flex-col gap-3">
              <ErrorText>{error}</ErrorText>
              <Button onClick={loginWithQrToken} disabled={loading}>
                {loading ? "Signing in..." : "Try again"}
              </Button>
            </div>
          ) : (
            <p className="rounded-md bg-green-50 px-3 py-2 text-center text-sm text-green-700">
              Table identified from QR code - signing you in...
            </p>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-800">Welcome</h1>
        <p className="text-sm text-slate-500">Enter your table code and PIN to start ordering</p>
      </div>
      {sessionExpired && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-center text-sm text-amber-800">
          Your session has ended. Please scan the QR code again or sign in to continue.
        </p>
      )}
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="text-sm font-medium text-slate-700">
            Table code
            <Input
              className="mt-1"
              placeholder="e.g. tbl1"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            PIN
            <Input
              className="mt-1"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </Card>

      {available.length > 0 && (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Available tables</h2>
          <div className="flex flex-wrap gap-2">
            {available.map((t) => (
              <button
                key={t._id}
                type="button"
                onClick={() => setCode(t.code)}
                className="rounded-md bg-slate-100 px-3 py-1 text-sm text-slate-700 hover:bg-slate-200"
              >
                {t.code}
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
