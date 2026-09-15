/**
 * Structured JSON logging. Vercel captures stdout/stderr per invocation, so lines
 * are emitted as single-line JSON to stay searchable there and in `docker logs`.
 */
export type LogLevel = "error" | "warn" | "info" | "debug";

const ORDER: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

function activeLevel(): LogLevel {
  const configured = (process.env.LOG_LEVEL || "").toLowerCase();
  if (configured in ORDER) return configured as LogLevel;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

/** Values that must never reach a log line, whatever the caller passes. */
const REDACT = new Set([
  "password",
  "newpassword",
  "oldpassword",
  "passwordhash",
  "securityanswer",
  "securityanswerhash",
  "token",
  "authorization",
  "jwt_secret",
  "mongo_uri",
  "r2_secret_access_key",
  "r2_access_key_id",
]);

function sanitize(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== "object" || depth > 4) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => sanitize(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = REDACT.has(key.toLowerCase()) ? "[redacted]" : sanitize(val, depth + 1);
  }
  return out;
}

function emit(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (ORDER[level] > ORDER[activeLevel()]) return;

  const line = JSON.stringify({
    level,
    message,
    time: new Date().toISOString(),
    ...(context ? (sanitize(context) as Record<string, unknown>) : {}),
  });

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  error: (message: string, context?: Record<string, unknown>) => emit("error", message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit("warn", message, context),
  info: (message: string, context?: Record<string, unknown>) => emit("info", message, context),
  debug: (message: string, context?: Record<string, unknown>) => emit("debug", message, context),
};

/** Turns an unknown throwable into something safe to serialize. */
export function describeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { name: err.name, error: err.message, stack: err.stack?.split("\n").slice(0, 5).join("\n") };
  }
  return { error: String(err) };
}
