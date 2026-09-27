import { z } from "zod";

import { blankToUndefined, objectId } from "../../core/validate";

const name = z
  .string({ error: "A name is required" })
  .trim()
  .min(1, { error: "A name is required" })
  .max(40, { error: "Keep the name under 40 characters" });

export const idParams = z.object({ id: objectId() });

export const stationSchema = z.object({ name });

export const agentSchema = z.object({ name });

export const pairSchema = z.object({
  code: z
    .string({ error: "Enter the pairing code" })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{8}$/, { error: "The pairing code has 8 letters or digits" }),
});

const connection = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("network"),
    host: z
      .string({ error: "Enter the printer's IP address" })
      .trim()
      .regex(/^[A-Za-z0-9.-]{1,253}$/, { error: "Enter the printer's IP address" }),
    port: z.number().int().min(1).max(65535).default(9100),
  }),
  z.object({
    type: z.literal("shared"),
    shareName: z
      .string({ error: "Enter the Windows share name" })
      .trim()
      .regex(/^[A-Za-z0-9 _.-]{1,80}$/, { error: "Enter the Windows share name" }),
  }),
]);

export const printerSchema = z.object({
  name,
  agentId: objectId("Choose the computer this printer is connected to"),
  connection,
  paperWidth: z.union([z.literal(58), z.literal(80)]).default(80),
  printsBills: z.boolean().default(false),
  printsUnroutedKots: z.boolean().default(false),
  stationIds: z.array(objectId("Invalid station")).default([]),
  isActive: z.boolean().default(true),
});

export const jobsQuery = z.object({
  status: blankToUndefined(z.enum(["queued", "sent", "printed", "failed"], { error: "Invalid status" })),
});

export const jobResultSchema = z.object({
  ok: z.boolean({ error: "ok must be true or false" }),
  error: blankToUndefined(z.string().max(500)),
});

export type PrinterInput = z.output<typeof printerSchema>;
