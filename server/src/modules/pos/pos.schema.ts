import { z } from "zod";

import { blankToUndefined, objectId } from "../../core/validate";
import { addItemsSchema, paymentLine } from "../orders/orders.schema";

export const createPosOrderSchema = z
  .object({
    orderType: z.enum(["dine-in", "takeaway"], { error: "Choose dine-in or takeaway" }),
    tableId: blankToUndefined(objectId("Choose a table")),
    customerName: z
      .string()
      .nullish()
      .transform((value) => (value ?? "").trim().slice(0, 80)),
    customerPhone: z
      .string()
      .nullish()
      .transform((value) => (value ?? "").trim().slice(0, 20)),
    members: z
      .number({ error: "members must be a number" })
      .int()
      .min(1, { error: "members must be at least 1" })
      .nullish()
      .transform((value) => value ?? 1),
    sendToKitchen: z.boolean({ error: "sendToKitchen must be true or false" }).default(true),
  })
  .extend(addItemsSchema.shape);

export type CreatePosOrderInput = z.output<typeof createPosOrderSchema>;

export const offlineOrderSchema = createPosOrderSchema.omit({ sendToKitchen: true }).extend({
  clientId: z
    .string({ error: "clientId is required" })
    .regex(/^[A-Za-z0-9_-]{8,64}$/, { error: "clientId must be 8 to 64 letters, digits, dashes or underscores" }),
  createdAt: z.coerce.date({ error: "createdAt must be a date" }),
  clientTotal: z.number({ error: "clientTotal must be a number" }).min(0).max(10_000_000),
  payments: z.array(paymentLine).max(10).optional(),
});

export type OfflineOrderInput = z.output<typeof offlineOrderSchema>;
