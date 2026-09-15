import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, storeToken, setActiveAuth, extractErrorMessage, wasSessionExpired, clearExpiredFlag } from "../../lib/apiClient";
import { Button, Card, ErrorText, Input } from "../../components/ui";

export default function AdminLogin() {
  const [searchParams] = useSearchParams();
  const [sessionExpired] = useState(() => searchParams.get("expired") === "1" || wasSessionExpired("admin"));
  useEffect(() => clearExpiredFlag("admin"), []);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post("/auth/admin/login", { username, password });
      storeToken("admin", res.data.token);
      setActiveAuth({ role: "admin", token: res.data.token });
      navigate("/admin/dashboard");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4">
      <h1 className="text-center text-2xl font-bold text-slate-800">Admin Login</h1>
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="text-sm font-medium text-slate-700">
            Username
            <Input className="mt-1" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Password
            <Input
              className="mt-1"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {sessionExpired && !error && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Your session expired. Please sign in again.
            </p>
          )}
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </Card>
      <Link to="/admin/forgot-password" className="text-center text-sm text-orange-600 hover:underline">
        Forgot password?
      </Link>
    </div>
  );
}
