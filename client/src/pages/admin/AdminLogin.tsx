import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import {
  api,
  clearExpiredFlag,
  extractErrorMessage,
  setActiveAuth,
  storeToken,
  wasSessionExpired,
} from "../../shared/api/client";
import { Button, ErrorText, Input } from "../../shared/ui/ui";

export default function AdminLogin() {
  const [searchParams] = useSearchParams();
  const [sessionExpired] = useState(() => searchParams.get("expired") === "1" || wasSessionExpired("admin"));
  useEffect(() => clearExpiredFlag("admin"), []);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [brand, setBrand] = useState<{ name: string; logoUrl: string }>({ name: "", logoUrl: "" });
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get<{ name?: string; logoUrl?: string }>("/restaurant/public")
      .then((res) => setBrand({ name: res.data.name || "", logoUrl: res.data.logoUrl || "" }))
      .catch(() => {});
  }, []);

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
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-gradient-to-b from-orange-50 via-white to-slate-50 px-4 py-10">
      <div className="flex flex-col items-center gap-2">
        {brand.logoUrl ? (
          <img
            src={brand.logoUrl}
            alt=""
            className="h-16 w-16 rounded-full object-cover shadow-sm ring-1 ring-black/5"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 text-3xl">☕</div>
        )}
        {brand.name && <p className="text-lg font-bold text-slate-800">{brand.name}</p>}
        <span className="rounded-full bg-orange-100 px-3 py-0.5 text-xs font-semibold uppercase tracking-wide text-orange-700">
          Admin portal
        </span>
      </div>

      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
        <h1 className="text-center text-xl font-bold text-slate-800">Welcome back</h1>
        <p className="mb-5 mt-1 text-center text-sm text-slate-500">Sign in to manage your restaurant.</p>
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
          <Button type="submit" disabled={loading} className="mt-1">
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
        <Link to="/admin/forgot-password" className="mt-4 block text-center text-sm text-orange-600 hover:underline">
          Forgot password?
        </Link>
      </div>

      <a href="/" className="text-xs text-slate-400 hover:text-slate-600">
        &larr; Back to site
      </a>
    </div>
  );
}
