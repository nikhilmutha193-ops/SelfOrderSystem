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

export const printingApi = {
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
