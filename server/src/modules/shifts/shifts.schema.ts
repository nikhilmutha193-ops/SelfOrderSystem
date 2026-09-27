import { z } from "zod";

import { blankToUndefined } from "../../core/validate";

const amount = z.number({ error: "Enter an amount" }).min(0, { error: "Amounts can't be negative" });

export const openShiftSchema = z.object({ openingFloat: amount });

export const cashMovementSchema = z.object({
  type: z.enum(["in", "out"], { error: "Choose cash in or cash out" }),
  amount: z.number({ error: "Enter an amount" }).positive({ error: "Enter an amount more than zero" }),
  reason: z
    .string({ error: "A reason is required" })
    .trim()
    .min(3, { error: "A reason is required" })
    .max(120, { error: "Keep the reason under 120 characters" }),
});

export const closeShiftSchema = z.object({
  countedCash: amount,
  note: blankToUndefined(z.string().trim().max(200, { error: "Keep the note under 200 characters" })),
});

const businessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Dates must be in YYYY-MM-DD format" });

export const dayQuery = z.object({ date: blankToUndefined(businessDate) });

export const closeDaySchema = z.object({
  date: blankToUndefined(businessDate),
  carryForward: z.boolean().optional(),
});

export const dateParams = z.object({ date: businessDate });

export type CashMovementInput = z.output<typeof cashMovementSchema>;
export type CloseShiftInput = z.output<typeof closeShiftSchema>;
export type CloseDayInput = z.output<typeof closeDaySchema>;
