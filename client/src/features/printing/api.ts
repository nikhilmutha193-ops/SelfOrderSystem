import type {
  PairingCode,
  PrintAgent,
  Printer,
  PrinterInput,
  PrintingStatus,
  PrintJob,
  PrintJobStatus,
  Station,
} from "../../lib/types";
import { api } from "../../shared/api/client";

export interface AgentDownloads {
  zip: { filename: string; sizeBytes: number };
  exe: { filename: string; available: boolean; sizeBytes: number };
}

/**
 * Downloads through a short-lived link instead of fetching the file into the page: the browser itself saves it, which
 * streams to disk and works for files of tens of megabytes (an in-page fetch of one failed with "Network Error").
 */
async function saveDownload(kind: "zip" | "app", filename: string) {
  const { url } = (await api.post<{ url: string }>("/printing/agent/download-link", { kind })).data;
  const link = document.createElement("a");
  link.href = `${api.defaults.baseURL ?? "/api"}${url}`;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export const printingApi = {
  agentDownloads: () => api.get<AgentDownloads>("/printing/agent/downloads").then((res) => res.data),
  downloadAgentZip: () => saveDownload("zip", "print-agent.zip"),
  downloadAgentExe: () => saveDownload("app", "PrintAgent.zip"),
  status: () => api.get<PrintingStatus>("/printing/status").then((res) => res.data),
  myStation: () =>
    api.get<{ stationId: string | null; stations: Station[] }>("/printing/my-station").then((res) => res.data),
  stations: () => api.get<Station[]>("/printing/stations").then((res) => res.data),
  createStation: (name: string) => api.post<Station>("/printing/stations", { name }).then((res) => res.data),
  renameStation: ({ id, name }: { id: string; name: string }) =>
    api.put<Station>(`/printing/stations/${id}`, { name }).then((res) => res.data),
  deleteStation: (id: string) => api.delete(`/printing/stations/${id}`).then((res) => res.data),
  setChefStation: ({ chefId, stationId }: { chefId: string; stationId: string | null }) =>
    api.put(`/printing/chefs/${chefId}/station`, { stationId }).then((res) => res.data),
  agents: () => api.get<PrintAgent[]>("/printing/agents").then((res) => res.data),
  createAgent: (name: string) => api.post<PairingCode>("/printing/agents", { name }).then((res) => res.data),
  renewPairingCode: (id: string) =>
    api.post<PairingCode>(`/printing/agents/${id}/pairing-code`).then((res) => res.data),
  revokeAgent: (id: string) => api.delete(`/printing/agents/${id}`).then((res) => res.data),
  printers: () => api.get<Printer[]>("/printing/printers").then((res) => res.data),
  createPrinter: (input: PrinterInput) => api.post<Printer>("/printing/printers", input).then((res) => res.data),
  updatePrinter: ({ id, input }: { id: string; input: PrinterInput }) =>
    api.put<Printer>(`/printing/printers/${id}`, input).then((res) => res.data),
  deletePrinter: (id: string) => api.delete(`/printing/printers/${id}`).then((res) => res.data),
  testPrinter: (id: string) => api.post(`/printing/printers/${id}/test`).then((res) => res.data),
  jobs: (status?: PrintJobStatus) =>
    api.get<PrintJob[]>("/printing/jobs", { params: status ? { status } : undefined }).then((res) => res.data),
  retryJob: (id: string) => api.post(`/printing/jobs/${id}/retry`).then((res) => res.data),
};
