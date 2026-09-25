import { Types } from "mongoose";
import { z } from "zod";

import { HttpError } from "../utils/httpError";

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const result = schema.safeParse(data ?? {});
  if (!result.success) throw new HttpError(400, result.error.issues[0]?.message ?? "Invalid request");
  return result.data;
}

export function objectId(message = "Invalid id") {
  return z.string({ error: message }).refine((value) => Types.ObjectId.isValid(value), { error: message });
}

export function blankToUndefined<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === "" || value === null ? undefined : value), schema.optional());
}
