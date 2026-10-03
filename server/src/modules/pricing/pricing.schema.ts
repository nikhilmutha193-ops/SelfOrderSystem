import { z } from "zod";

import { objectId } from "../../core/validate";

export const areasSchema = z.object({
  areas: z
    .array(
      z.object({
        _id: objectId("Invalid area").optional(),
        name: z
          .string({ error: "Name each area" })
          .trim()
          .min(1, { error: "Name each area" })
          .max(40, { error: "Keep area names under 40 characters" }),
      }),
      { error: "Areas must be a list" }
    )
    .max(20, { error: "Use at most 20 areas" })
    .refine((areas) => new Set(areas.map((a) => a.name.toLowerCase())).size === areas.length, {
      error: "Each area needs a different name",
    }),
});

export const tableParams = z.object({ id: objectId("Invalid table") });

export const tableAreaSchema = z.object({
  areaId: z.union([objectId("Invalid area"), z.null()], { error: "Choose an area" }),
});

export type AreasInput = z.output<typeof areasSchema>;
