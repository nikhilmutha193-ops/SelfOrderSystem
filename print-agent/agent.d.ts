export interface AgentConfig {
  server: string;
  token: string;
  agentId?: string;
  name?: string;
  restaurantName?: string;
}

export interface AgentPrinter {
  id: string;
  name: string;
  connection: { type: "network"; host: string; port?: number } | { type: "shared"; shareName: string };
  paperWidth: 58 | 80;
}

export interface JobOutcome {
  id: string;
  ok: boolean;
  error?: string;
}

export function pair(server: string, code: string): Promise<AgentConfig>;
export function pollOnce(
  config: AgentConfig,
  print?: (printer: AgentPrinter, data: Buffer) => Promise<void>
): Promise<JobOutcome[]>;
export function sendToPrinter(printer: AgentPrinter, data: Buffer): Promise<void>;
