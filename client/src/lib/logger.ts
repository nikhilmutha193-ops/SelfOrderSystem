/**
 * Browser-side logging. Keeps a rolling buffer of recent entries so a user hitting
 * a bug can hand over what happened, and stays quiet in production except for
 * warnings and errors.
 */
export type LogLevel = "error" | "warn" | "info" | "debug";

export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  time: string;
}

const ORDER: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };
const MAX_ENTRIES = 200;
const activeLevel: LogLevel = import.meta.env.PROD ? "warn" : "debug";

const buffer: LogEntry[] = [];

function emit(level: LogLevel, message: string, context?: Record<string, unknown>) {
  const entry: LogEntry = { level, message, context, time: new Date().toISOString() };

  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.shift();

  if (ORDER[level] > ORDER[activeLevel]) return;
  const args = context ? [`[${level}] ${message}`, context] : [`[${level}] ${message}`];
  if (level === "error") console.error(...args);
  else if (level === "warn") console.warn(...args);
  else console.log(...args);
}

export const log = {
  error: (message: string, context?: Record<string, unknown>) => emit("error", message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit("warn", message, context),
  info: (message: string, context?: Record<string, unknown>) => emit("info", message, context),
  debug: (message: string, context?: Record<string, unknown>) => emit("debug", message, context),
};

export function getRecentLogs(): LogEntry[] {
  return [...buffer];
}

/** Copy-pasteable text for a bug report. */
export function exportLogs(): string {
  return buffer.map((e) => `${e.time} [${e.level}] ${e.message}${e.context ? " " + JSON.stringify(e.context) : ""}`).join("\n");
}
