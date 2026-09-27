import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { PrintJobStatus, Station } from "../../lib/types";
import { POLL } from "../../shared/api/queryClient";
import { printingApi } from "./api";

export const printingKeys = {
  all: ["printing"] as const,
  status: ["printing", "status"] as const,
  myStation: ["printing", "myStation"] as const,
  stations: ["printing", "stations"] as const,
  agents: ["printing", "agents"] as const,
  printers: ["printing", "printers"] as const,
  jobs: (status?: PrintJobStatus) => ["printing", "jobs", status ?? "all"] as const,
};

export function usePrintingStatus(enabled = true) {
  return useQuery({ queryKey: printingKeys.status, queryFn: printingApi.status, enabled, staleTime: 30000 });
}

export function useMyStation() {
  return useQuery({ queryKey: printingKeys.myStation, queryFn: printingApi.myStation, staleTime: 60000 });
}

const NO_STATIONS: Station[] = [];

export function useStationList(): Station[] {
  return useMyStation().data?.stations ?? NO_STATIONS;
}

export function useStations() {
  return useQuery({ queryKey: printingKeys.stations, queryFn: printingApi.stations });
}

export function usePrintAgents() {
  return useQuery({ queryKey: printingKeys.agents, queryFn: printingApi.agents, refetchInterval: POLL.printing });
}

export function usePrinters() {
  return useQuery({ queryKey: printingKeys.printers, queryFn: printingApi.printers });
}

export function usePrintJobs(status?: PrintJobStatus) {
  return useQuery({
    queryKey: printingKeys.jobs(status),
    queryFn: () => printingApi.jobs(status),
    refetchInterval: POLL.printing,
  });
}

function usePrintingMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: printingKeys.all }),
  });
}

export const useCreateStation = () => usePrintingMutation(printingApi.createStation);
export const useRenameStation = () => usePrintingMutation(printingApi.renameStation);
export const useDeleteStation = () => usePrintingMutation(printingApi.deleteStation);
export const useSetChefStation = () => usePrintingMutation(printingApi.setChefStation);
export const useCreateAgent = () => usePrintingMutation(printingApi.createAgent);
export const useRenewPairingCode = () => usePrintingMutation(printingApi.renewPairingCode);
export const useRevokeAgent = () => usePrintingMutation(printingApi.revokeAgent);
export const useCreatePrinter = () => usePrintingMutation(printingApi.createPrinter);
export const useUpdatePrinter = () => usePrintingMutation(printingApi.updatePrinter);
export const useDeletePrinter = () => usePrintingMutation(printingApi.deletePrinter);
export const useTestPrinter = () => usePrintingMutation(printingApi.testPrinter);
export const useRetryJob = () => usePrintingMutation(printingApi.retryJob);
