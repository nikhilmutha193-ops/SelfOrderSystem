import { z } from "zod";

import { objectId } from "../../core/validate";

export const customerParams = z.object({ id: objectId("Invalid customer") });

export const creditPaymentSchema = z.object({
  amount: z
    .number({ error: "Enter the amount received" })
    .positive({ error: "Enter the amount received" })
    .max(10_000_000, { error: "That amount is too large" }),
  method: z.enum(["cash", "upi", "card", "online"], { error: "Choose how the guest paid" }),
  reference: z.string().trim().max(60).optional(),
  note: z.string().trim().max(200).optional(),
});

export const creditLimitSchema = z.object({
  creditLimit: z.union(
    [z.number().min(0, { error: "The limit can't be negative" }).max(10_000_000), z.null()],
    { error: "Enter a limit or leave it empty for no limit" }
  ),
});

export type CreditPaymentInput = z.output<typeof creditPaymentSchema>;
