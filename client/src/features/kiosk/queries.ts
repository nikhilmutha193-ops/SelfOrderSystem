import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { kioskAdminApi, pickupApi } from "./api";

export const kioskKeys = {
  devices: ["kiosk", "devices"] as const,
  settings: ["kiosk", "settings"] as const,
  pickup: ["pickup", "board"] as const,
};

export function useKioskDevices() {
  return useQuery({ queryKey: kioskKeys.devices, queryFn: kioskAdminApi.devices, refetchInterval: 30_000 });
}

export function useKioskSettings() {
  return useQuery({ queryKey: kioskKeys.settings, queryFn: kioskAdminApi.settings });
}

function useDeviceMutation<T, R>(fn: (input: T) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: kioskKeys.devices }),
  });
}

export const useCreateKiosk = () => useDeviceMutation(kioskAdminApi.createDevice);
export const useRenewKioskCode = () => useDeviceMutation(kioskAdminApi.renewPairingCode);
export const useRevokeKiosk = () => useDeviceMutation(kioskAdminApi.revokeDevice);

export function useSaveKioskSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: kioskAdminApi.saveSettings,
    onSuccess: (data) => queryClient.setQueryData(kioskKeys.settings, data),
  });
}

/** The pickup TV polls every few seconds and keeps going in a background tab. */
export function usePickupBoard() {
  return useQuery({
    queryKey: kioskKeys.pickup,
    queryFn: pickupApi.board,
    refetchInterval: 4_000,
    refetchIntervalInBackground: true,
  });
}
