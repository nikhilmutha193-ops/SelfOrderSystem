import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { PosFloor, PosMenu } from "../../lib/types";
import { POLL } from "../../shared/api/queryClient";
import { refreshOrderData } from "../orders/queries";
import { posApi } from "./api";

export const posKeys = {
  menu: ["pos", "menu"] as const,
  floor: ["orders", "pos-floor"] as const,
};

const MENU_CACHE = "selforder_pos_menu_v1";
const FLOOR_CACHE = "selforder_pos_floor_v1";

function readCache<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function writeCache(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
}

export function usePosMenu() {
  return useQuery({
    queryKey: posKeys.menu,
    queryFn: async () => {
      const menu = await posApi.menu();
      writeCache(MENU_CACHE, menu);
      return menu;
    },
    initialData: () => readCache<PosMenu>(MENU_CACHE),
    initialDataUpdatedAt: 0,
    staleTime: 5 * 60_000,
  });
}

export function usePosFloor() {
  return useQuery({
    queryKey: posKeys.floor,
    queryFn: async () => {
      const floor = await posApi.floor();
      writeCache(FLOOR_CACHE, floor);
      return floor;
    },
    initialData: () => readCache<PosFloor>(FLOOR_CACHE),
    initialDataUpdatedAt: 0,
    refetchInterval: POLL.posFloor,
  });
}

export function useCreatePosOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: posApi.createOrder,
    onSuccess: () => refreshOrderData(queryClient),
  });
}
