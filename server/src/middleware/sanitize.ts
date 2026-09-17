import { Request, Response, NextFunction } from "express";

/**
 * Strips MongoDB query operators from request input. Mongoose passes plain objects
 * straight into queries, so an attacker who sends `{"username":{"$ne":null}}` or the
 * query string `?username[$ne]=x` can turn an equality match into an operator and
 * bypass the intended lookup. Keys beginning with "$" (operators) or containing "."
 * (dotted paths that reach into sub-documents) are removed in place, everywhere they
 * appear in the object graph. Legitimate values never need those characters as keys.
 */
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
  // req.query / req.params are getters backed by mutable objects in Express 4;
  // mutate the existing object rather than reassigning the read-only property.
  stripOperators(req.query);
  stripOperators(req.params);
  next();
}
