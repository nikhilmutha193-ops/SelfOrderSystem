import { NextFunction, Request, Response } from "express";

function stripOperators(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) stripOperators(item);
    return;
  }
  if (value === null || typeof value !== "object") return;

  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (key.startsWith("$") || key.includes(".")) {
      delete obj[key];
      continue;
    }
    stripOperators(obj[key]);
  }
}

export function sanitizeRequest(req: Request, _res: Response, next: NextFunction) {
  stripOperators(req.body);
  stripOperators(req.query);
  stripOperators(req.params);
  next();
}
