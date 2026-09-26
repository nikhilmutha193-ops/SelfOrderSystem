import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { activateStoredAuth, clearStoredToken, setActiveAuth } from "../../../shared/api/client";
import { Button } from "../../../shared/ui/ui";
import KotQueueView from "../components/KotQueueView";

export default function ChefDashboard() {
  const navigate = useNavigate();

  useEffect(() => {
    activateStoredAuth("chef");
  }, []);

  function logout() {
    clearStoredToken("chef");
    setActiveAuth(null);
    navigate("/chef/login", { replace: true });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Kitchen Dashboard</h1>
        <Button variant="secondary" onClick={logout}>
          Logout
        </Button>
      </div>
      <KotQueueView canCancel={false} />
    </div>
  );
}
