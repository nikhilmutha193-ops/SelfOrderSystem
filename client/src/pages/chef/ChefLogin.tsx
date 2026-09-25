import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button, ErrorText, Input } from "../../components/ui";
import { api, extractErrorMessage, setActiveAuth, storeToken } from "../../lib/apiClient";

export default function ChefLogin() {
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
      const res = await api.post("/auth/chef/login", { username, password });
      storeToken("chef", res.data.token);
      setActiveAuth({ role: "chef", token: res.data.token });
      navigate("/chef/dashboard");
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
          Kitchen portal
        </span>
      </div>

      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
        <h1 className="text-center text-xl font-bold text-slate-800">Kitchen sign in</h1>
        <p className="mb-5 mt-1 text-center text-sm text-slate-500">Sign in to view and update kitchen tickets.</p>
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
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={loading} className="mt-1">
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </div>

      <a href="/" className="text-xs text-slate-400 hover:text-slate-600">
        &larr; Back to site
      </a>
    </div>
  );
}
