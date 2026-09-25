import { z } from "zod";

import { blankToUndefined, objectId } from "../../core/validate";

const customerName = z
  .string({ error: "customerName is required" })
  .trim()
  .min(1, { error: "customerName is required" });

const customerPhone = z
  .string({ error: "customerPhone must be text" })
  .trim()
  .nullish()
  .transform((value) => value || "");

const members = z
  .number({ error: "members must be a number" })
  .nullish()
  .transform((value) => value || 1)
  .pipe(z.number().min(1, { error: "members must be at least 1" }));

const customer = { customerName, customerPhone, members };

export const orderIdParams = z.object({ orderId: objectId() });

export const itemIdParams = z.object({ itemId: objectId() });

export const startDineInSchema = z.object(customer);

export const startTakeawaySchema = z.object(customer);

export const startDeliverySchema = z.object({
  provider: z.enum(["Swiggy", "Zomato", "Uber-Eats", "Other"], { error: "A valid provider is required" }),
  ...customer,
});

export const startCounterSchema = z.object({
  ...customer,
  tableId: blankToUndefined(objectId()),
  allowOccupied: z.boolean().nullish(),
});

const orderLineSchema = z.object({
  foodItemId: objectId("Invalid foodItemId"),
  quantity: z
    .number({ error: "quantity must be at least 1" })
    .int({ error: "quantity must be a whole number" })
    .min(1, { error: "quantity must be at least 1" }),
  isJain: z.boolean().nullish(),
  note: z
    .string()
    .nullish()
    .transform((value) => (value ?? "").trim().slice(0, 200)),
  modifiers: z.array(z.object({ groupName: z.string(), label: z.string() })).nullish(),
});

export const addItemsSchema = z.object({
  items: z
    .array(orderLineSchema, { error: "items must be a non-empty array" })
    .min(1, { error: "items must be a non-empty array" }),
});

const businessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Dates must be in YYYY-MM-DD format" });

export const orderFilterQuery = z.object({
  type: blankToUndefined(z.enum(["dine-in", "takeaway", "delivery"], { error: "Invalid order type" })),
  status: blankToUndefined(z.enum(["open", "closed", "cancelled"], { error: "Invalid order status" })),
  today: blankToUndefined(z.string()),
  from: blankToUndefined(businessDate),
  to: blankToUndefined(businessDate),
});

export const payOrderSchema = z.object({
  paymentMethod: z.enum(["cash", "online", "card"], {
    error: "A valid paymentMethod (cash, online, card) is required",
  }),
});

export const applyCouponSchema = z.object({
  code: z.string({ error: "code is required" }).trim().min(1, { error: "code is required" }),
});

export type StartDineInInput = z.output<typeof startDineInSchema>;
export type StartTakeawayInput = z.output<typeof startTakeawaySchema>;
export type StartDeliveryInput = z.output<typeof startDeliverySchema>;
export type StartCounterInput = z.output<typeof startCounterSchema>;
export type AddItemsInput = z.output<typeof addItemsSchema>;
export type OrderFilterInput = z.output<typeof orderFilterQuery>;
export type PayOrderInput = z.output<typeof payOrderSchema>;
