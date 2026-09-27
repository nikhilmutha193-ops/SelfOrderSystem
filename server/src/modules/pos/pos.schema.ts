import { z } from "zod";

import { blankToUndefined, objectId } from "../../core/validate";
import { addItemsSchema } from "../orders/orders.schema";

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
