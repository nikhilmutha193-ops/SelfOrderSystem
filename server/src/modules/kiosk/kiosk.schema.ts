import { z } from "zod";

import { objectId } from "../../core/validate";
import { addItemsSchema } from "../orders/orders.schema";

export const deviceIdParams = z.object({ deviceId: objectId("Invalid kiosk") });
export const orderIdParams = z.object({ orderId: objectId() });

export const deviceNameSchema = z.object({
  name: z
    .string({ error: "Give the kiosk a name" })
    .trim()
    .min(1, { error: "Give the kiosk a name" })
    .max(40, { error: "Keep the name under 40 characters" }),
});

export const pairSchema = z.object({
  code: z
    .string({ error: "Enter the pairing code" })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{8}$/, { error: "The pairing code is 8 letters and digits" }),
});

export const kioskSettingsSchema = z
  .object({
    eatIn: z.boolean({ error: "Choose whether guests can eat in" }),
    takeaway: z.boolean({ error: "Choose whether guests can take away" }),
    payAtCounter: z.boolean({ error: "Choose whether guests can pay at the counter" }),
    idleSeconds: z
      .number({ error: "Idle time must be a number" })
      .int({ error: "Idle time must be whole seconds" })
      .min(20, { error: "Idle time must be at least 20 seconds" })
      .max(300, { error: "Idle time must be at most 300 seconds" }),
  })
  .refine((s) => s.eatIn || s.takeaway, { error: "Allow eating in, taking away, or both" });

export type KioskSettingsInput = z.output<typeof kioskSettingsSchema>;

export const kioskOrderSchema = z
  .object({ orderType: z.enum(["dine-in", "takeaway"], { error: "Choose eat here or take away" }) })
  .extend(addItemsSchema.shape)
  .refine((o) => o.items.length <= 50, { error: "That's a lot of dishes. Please order up to 50 lines." });

export type KioskOrderInput = z.output<typeof kioskOrderSchema>;
