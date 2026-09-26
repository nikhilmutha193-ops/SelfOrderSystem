import { Request } from "express";
import rateLimit from "express-rate-limit";

import { verifyToken } from "../utils/jwt";

export const PRINCIPAL_LIMIT_PER_MINUTE = 300;
export const ANONYMOUS_LIMIT_PER_MINUTE = 600;

const principalKeys = new WeakMap<Request, string | null>();

function principalKey(req: Request): string | null {
  if (principalKeys.has(req)) return principalKeys.get(req)!;

  let key: string | null = null;
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      const payload = verifyToken(header.slice("Bearer ".length));
      key =
        payload.role === "table"
          ? `table:${payload.tableId ?? payload.id}:${payload.sessionId ?? payload.orderId ?? "new"}`
          : `${payload.role}:${payload.id}`;
    } catch {
      key = null;
    }
  }
  principalKeys.set(req, key);
  return key;
}

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please wait a few minutes and try again." },
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: (req) => (principalKey(req) ? PRINCIPAL_LIMIT_PER_MINUTE : ANONYMOUS_LIMIT_PER_MINUTE),
  keyGenerator: (req) => principalKey(req) ?? `ip:${req.ip}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please slow down." },
});
