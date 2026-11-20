import fs from "fs";
import path from "path";

import { openSecret, sealSecret } from "./secretBox";

// The database address chosen in the admin (Backup & Restore -> Database connection) lives in a small file, not in the
// database itself: the server has to know where its database is before it can read anything from it. The connection
// string holds a password, so it is sealed with a key derived from JWT_SECRET. Not part of backups.
const dir = () => process.env.DB_CONFIG_DIR || path.join(__dirname, "..", "..", "config-data");
const file = () => path.join(dir(), "db-config.json");

/** The saved connection string, or null when none is saved (or it can't be read, e.g. after JWT_SECRET changed). */
export function readDbOverride(): string | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file(), "utf8")) as { uri?: string };
    return parsed.uri ? openSecret(parsed.uri) : null;
  } catch {
    return null;
  }
}

export function writeDbOverride(uri: string): void {
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify({ uri: sealSecret(uri), savedAt: new Date().toISOString() }), { mode: 0o600 });
}

export function clearDbOverride(): void {
  fs.rmSync(file(), { force: true });
}

const URI_PATTERN = /^(mongodb(?:\+srv)?):\/\/(?:([^:@/]+)(?::[^@]*)?@)?([^/?]+)(?:\/([^?]*))?/;

export function isMongoUri(value: unknown): value is string {
  return typeof value === "string" && URI_PATTERN.test(value.trim());
}

export interface UriParts {
  scheme: string;
  user: string | null;
  hosts: string;
  database: string;
}

/** The parts of a connection string that are safe to show: never the password. */
export function describeUri(uri: string): UriParts {
  const m = URI_PATTERN.exec(uri.trim());
  if (!m) return { scheme: "", user: null, hosts: "", database: "" };
  return { scheme: m[1], user: m[2] ? decodeURIComponent(m[2]) : null, hosts: m[3], database: m[4] ?? "" };
}

export function maskUri(uri: string): string {
  return uri.trim().replace(/:\/\/([^:/@]+):[^@]*@/, "://$1:***@");
}
