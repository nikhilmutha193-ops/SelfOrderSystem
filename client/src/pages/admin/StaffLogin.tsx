import { MonitorSmartphone, Smartphone, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { can, MODULES, type AdminProfile, type ModuleKey } from "../../lib/adminAuth";
import {
  api,
  clearExpiredFlag,
  extractErrorMessage,
  setActiveAuth,
  storeToken,
  wasSessionExpired,
} from "../../shared/api/client";
import { Button, ErrorText, Input } from "../../shared/ui/ui";

interface StaffLoginConfig {
  badge: string;
  title: string;
  lead: string;
  home: string;
  module: ModuleKey;
  icon: LucideIcon;
}

const CONFIGS = {
  cashier: {
    badge: "Cashier · POS",
    title: "Cashier sign-in",
    lead: "Sign in to bill and settle orders at the counter.",
    home: "/pos",
    module: "pos",
    icon: MonitorSmartphone,
  },
  captain: {
    badge: "Captain app",
    title: "Captain sign-in",
    lead: "Sign in to take table orders and serve ready dishes.",
    home: "/captain",
    module: "captain",
    icon: Smartphone,
  },
} satisfies Record<string, StaffLoginConfig>;

export type StaffLoginKind = keyof typeof CONFIGS;

/**
 * A sign-in page for one staff role. It uses the same accounts as the admin portal, but only lets in a
 * login that has the page this role works in (POS Billing or Captain App), and opens that page directly.
 */
export default function StaffLogin({ kind }: { kind: StaffLoginKind }) {
  const config = CONFIGS[kind];
  const Icon = config.icon;
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
      .catch(() => {
        /* the page works without the restaurant's name and logo */
      });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<{ token: string; admin: AdminProfile }>("/auth/admin/login", { username, password });
      // Check the page access before keeping the sign-in, so a wrong role is never left signed in.
      if (!can(res.data.admin, config.module)) {
        setError(
          `This login can't open the ${kind === "cashier" ? "POS" : "Captain app"}. Ask the owner to give it ${MODULES[config.module]} access under Admin Users.`,
        );
        return;
      }
      storeToken("admin", res.data.token);
      setActiveAuth({ role: "admin", token: res.data.token });
      const next = searchParams.get("next");
      const sameArea = next && next.startsWith(config.home) && !next.startsWith("//");
      navigate(sameArea ? next : config.home, { replace: true });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-gradient-to-b from-orange-50 via-white to-slate-50 px-4 py-10">
      <div className="flex flex-col items-center gap-2">
        {brand.logoUrl ? (
          <img
            src={brand.logoUrl}
            alt=""
            className="h-16 w-16 rounded-full object-cover shadow-sm ring-1 ring-black/5"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 text-orange-600">
            <Icon size={30} aria-hidden="true" />
          </div>
        )}
        {brand.name && <p className="text-lg font-bold text-slate-800">{brand.name}</p>}
        <span className="rounded-full bg-orange-100 px-3 py-0.5 text-xs font-semibold tracking-wide text-orange-700 uppercase">
          {config.badge}
        </span>
      </div>

      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
        <h1 className="text-center text-xl font-bold text-slate-800">{config.title}</h1>
        <p className="mt-1 mb-5 text-center text-sm text-slate-500">{config.lead}</p>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="text-sm font-medium text-slate-700">
            Username
            <Input
              className="mt-1"
              value={username}
              autoComplete="username"
              autoCapitalize="none"
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Password
            <Input
              className="mt-1"
              type="password"
              autoComplete="current-password"
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
        <p className="mt-4 text-center text-xs text-slate-500">Forgot your password? Ask the owner to reset it.</p>
      </div>

      <a href="/" className="text-xs text-slate-400 hover:text-slate-600">
        &larr; Back to site
      </a>
    </div>
  );
}
