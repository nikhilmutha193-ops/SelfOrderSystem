import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";

import MaintenanceView from "../features/maintenance/MaintenanceView";
import { api } from "../shared/api/client";

interface MaintenanceStatus {
  active: boolean;
  title: string;
  message: string;
  imageUrl: string;
  startAt: string | null;
  endAt: string | null;
  restaurantName: string;
  logoUrl: string;
}

// The pages staff use. Their data is still protected by the server, which lets only signed-in admins through while
// maintenance is on, so the chef screen and the guest, kiosk and website pages get the maintenance page instead.
const STAFF_PATHS = ["/admin", "/pos", "/captain"];

/** Shows the maintenance page in place of every public page while the owner has maintenance mode active. */
export default function MaintenanceGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { data } = useQuery({
    queryKey: ["maintenance"],
    queryFn: async () => (await api.get<MaintenanceStatus>("/maintenance")).data,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const staff = STAFF_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (data?.active && !staff) return <MaintenanceView content={data} />;
  return <>{children}</>;
}
