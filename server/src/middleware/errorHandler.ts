import { NextFunction, Request, Response } from "express";

import { describeError, logger } from "../utils/logger";

export function asyncHandler<T extends (req: Request, res: Response, next: NextFunction) => Promise<unknown>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ message: "That image is too large. Please use one under 4MB." });
  }

  const status = err.status || 500;
  const context = { requestId: req.requestId, method: req.method, path: req.path, status, ...describeError(err) };
  if (status >= 500) logger.error("unhandled error", context);
  else logger.warn("request error", context);

  const message = status >= 500 ? "Something went wrong. Please try again." : err.message || "Request failed";
  res.status(status).json({ message, requestId: req.requestId });
}
