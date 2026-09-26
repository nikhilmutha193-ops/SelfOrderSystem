import { Request } from "express";

import IdempotencyRecord from "../models/IdempotencyRecord";
import { HttpError } from "../utils/httpError";
import { RequestContext } from "./context";

export interface IdempotentResult<T> {
  status: number;
  body: T;
}

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;

export function idempotencyKey(req: Request): string | undefined {
  const key = req.header("Idempotency-Key");
  if (key === undefined) return undefined;
  if (!KEY_PATTERN.test(key)) {
    throw new HttpError(400, "Idempotency-Key must be 8 to 100 letters, digits, dashes or underscores");
  }
  return key;
}

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}

export async function runIdempotent<T>(
  ctx: RequestContext,
  key: string | undefined,
  scope: string,
  work: () => Promise<IdempotentResult<T>>
): Promise<IdempotentResult<T>> {
  if (!key) return work();

  const where = { restaurantId: ctx.restaurantId, key };
  try {
    await IdempotencyRecord.create({ ...where, scope, completed: false });
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    const existing = await IdempotencyRecord.findOne(where);
    if (!existing || existing.scope !== scope) {
      throw new HttpError(422, "This Idempotency-Key was already used for a different request");
    }
    if (!existing.completed) throw new HttpError(409, "This request is already being processed");
    return { status: existing.statusCode ?? 200, body: existing.response as T };
  }

  try {
    const result = await work();
    await IdempotencyRecord.updateOne(where, {
      $set: { completed: true, statusCode: result.status, response: JSON.parse(JSON.stringify(result.body)) },
    });
    return result;
  } catch (err) {
    await IdempotencyRecord.deleteOne(where);
    throw err;
  }
}
