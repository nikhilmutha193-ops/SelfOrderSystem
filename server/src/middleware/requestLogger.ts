import { randomUUID } from "crypto";
import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

/** Logs one line per request once the response finishes, tagged with an id the client can quote. */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const requestId = req.header("x-request-id") || randomUUID();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  const startedAt = Date.now();
  res.on("finish", () => {
    const context = {
      requestId,
      method: req.method,
      // originalUrl carries the query string, which can hold a username - path only.
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
      role: req.auth?.role,
    };
    if (res.statusCode >= 500) logger.error("request failed", context);
    else if (res.statusCode >= 400) logger.warn("request rejected", context);
    else logger.info("request", context);
  });

  next();
}
