import fs from "fs";
import jwt from "jsonwebtoken";
import path from "path";
import { promisify } from "util";
import { deflateRaw } from "zlib";

import { AGENT_FILES } from "../../utils/agentFiles.generated";
import { createZip } from "../../utils/zip";

const SERVER_ROOT = path.join(__dirname, "..", "..", "..");

/**
 * Where PrintAgent.exe is looked for: only PRINT_AGENT_EXE when it is set, otherwise server/downloads (the Docker setup
 * mounts the repository's downloads folder at /app/downloads), then the folder `node build-exe.js` writes to when the
 * repository is checked out.
 */
function exeCandidates(): string[] {
  if (process.env.PRINT_AGENT_EXE) return [process.env.PRINT_AGENT_EXE];
  return [
    path.join(SERVER_ROOT, "downloads", "PrintAgent.exe"),
    path.join(SERVER_ROOT, "..", "print-agent", "dist", "PrintAgent.exe"),
  ];
}

export function agentExePath(): string | null {
  return exeCandidates().find((file) => fs.existsSync(file)) ?? null;
}

export function agentZip(): Buffer {
  return createZip(
    Object.entries(AGENT_FILES).map(([name, content]) => ({ name: `print-agent/${name}`, content }))
  );
}

export function agentDownloadInfo() {
  const exe = agentExePath();
  return {
    zip: { filename: "print-agent.zip", sizeBytes: agentZip().length },
    exe: { filename: "PrintAgent.zip", available: !!exe, sizeBytes: exe ? fs.statSync(exe).size : 0 },
  };
}

const deflate = promisify(deflateRaw);
let appZipCache: { file: string; mtimeMs: number; size: number; zip: Buffer } | null = null;

/**
 * PrintAgent.exe with its two scripts as one zip. Browsers (Edge and Chrome especially, over plain http) often refuse to
 * download an unsigned .exe, but a zip is fine, and deflating cuts the size to a third. Built once per exe file.
 */
export async function agentAppZip(): Promise<Buffer | null> {
  const file = agentExePath();
  if (!file) return null;
  const stat = fs.statSync(file);
  if (appZipCache && appZipCache.file === file && appZipCache.mtimeMs === stat.mtimeMs && appZipCache.size === stat.size) {
    return appZipCache.zip;
  }
  const exe = fs.readFileSync(file);
  const zip = createZip([
    { name: "PrintAgent/PrintAgent.exe", content: exe, compressed: await deflate(exe) },
    { name: "PrintAgent/pair.bat", content: AGENT_FILES["pair.bat"] },
    { name: "PrintAgent/start-agent.bat", content: AGENT_FILES["start-agent.bat"] },
  ]);
  appZipCache = { file, mtimeMs: stat.mtimeMs, size: stat.size, zip };
  return zip;
}

export type AgentFileKind = "zip" | "app";

const LINK_SECONDS = 120;

function linkSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return `${secret}:agent-download`;
}

/**
 * A two-minute link for one download. The browser then saves the file itself, which streams to disk, instead of the
 * page fetching tens of megabytes into memory (which fails with "Network Error" on some browsers and connections).
 */
export function signAgentDownload(kind: AgentFileKind, restaurantId: string): string {
  return jwt.sign({ kind, rid: restaurantId }, linkSecret(), { audience: "agent-download", expiresIn: LINK_SECONDS });
}

export function verifyAgentDownload(token: string, kind: string, restaurantId: string): boolean {
  try {
    const payload = jwt.verify(token, linkSecret(), { audience: "agent-download" }) as { kind?: string; rid?: string };
    return payload.kind === kind && payload.rid === restaurantId;
  } catch {
    return false;
  }
}
