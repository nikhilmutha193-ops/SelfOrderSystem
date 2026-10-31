import { z } from "zod";

import { blankToUndefined, objectId } from "../../core/validate";
import { REFUND_REASONS } from "../../models/Refund";

const businessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Dates must be in YYYY-MM-DD format" });

export const REFUND_METHODS = ["cash", "upi", "card", "online", "wallet"] as const;

export const createRefundSchema = z
  .object({
    orderId: objectId("Choose the order to refund"),
    items: z
      .array(
        z.object({
          itemId: objectId("Invalid item"),
          quantity: z
            .number({ error: "Quantity must be a whole number" })
            .int({ error: "Quantity must be a whole number" })
            .min(1, { error: "Quantity must be at least 1" })
            .optional(),
        })
      )
      .max(60)
      .optional(),
    // With items this overrides the worked-out amount (for example a goodwill discount); on its own it is the refund.
    amount: z
      .number({ error: "Enter the amount to refund" })
      .positive({ error: "Enter the amount to refund" })
      .max(1_000_000)
      .optional(),
    method: z.enum(REFUND_METHODS, { error: "Choose how the money goes back" }),
    reason: z.enum(REFUND_REASONS, { error: "Choose a reason" }),
    note: blankToUndefined(z.string().trim().max(200, { error: "The note is too long" })),
  })
  .refine((v) => (v.items && v.items.length > 0) || v.amount !== undefined, {
    error: "Choose the items to refund, or enter an amount",
  });

export const refundListQuery = z.object({
  from: blankToUndefined(businessDate),
  to: blankToUndefined(businessDate),
});

export const orderIdParam = z.object({ orderId: objectId() });

export type CreateRefundInput = z.output<typeof createRefundSchema>;
export type RefundListInput = z.output<typeof refundListQuery>;
