import { ChefHat, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { activateStoredAuth, clearStoredToken, setActiveAuth } from "../../../shared/api/client";
import { useStaffTheme } from "../../../shared/theme";
import { ThemeToggleButton } from "../../../shared/ui/ThemeToggle";
import { Button } from "../../../shared/ui/ui";
import KotQueueView from "../components/KotQueueView";

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function ChefDashboard() {
  useStaffTheme();
  const navigate = useNavigate();
  const now = useClock();

  useEffect(() => {
    activateStoredAuth("chef");
  }, []);

  function logout() {
    clearStoredToken("chef");
    setActiveAuth(null);
    navigate("/chef/login", { replace: true });
  }

  return (
    <div className="ui-app min-h-dvh">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 bg-slate-900 px-4 text-white sm:px-6">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-600">
          <ChefHat size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold">Kitchen display</h1>
          <p className="text-xs text-slate-400">Tickets refresh automatically</p>
        </div>
        <span className="hidden text-lg font-semibold tabular-nums sm:block">
          {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
        <ThemeToggleButton />
        <Button
          variant="ghost"
          icon={LogOut}
          className="!text-slate-300 hover:!bg-slate-800 hover:!text-white"
          onClick={logout}
        >
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </header>
      <main className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-6 sm:py-6">
        <KotQueueView canCancel={false} />
      </main>
    </div>
  );
}
