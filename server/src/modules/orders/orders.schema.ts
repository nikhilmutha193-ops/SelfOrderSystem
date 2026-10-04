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

// "MM-DD" - day and month only, no year, matching Customer.birthday (loyalty birthday offers).
const customerBirthday = blankToUndefined(
  z
    .string()
    .trim()
    .regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, { error: "Birthday must be in MM-DD format" })
);

// Only ever "true" or absent - an unchecked box on a later update must never downgrade consent
// already given (see updateOrderCustomer / linkOrder / applyCustomerUpdate).
const customerMarketingConsent = z
  .boolean()
  .nullish()
  .transform((v) => (v ? true : undefined));

export const orderIdParams = z.object({ orderId: objectId() });

export const itemIdParams = z.object({ itemId: objectId() });

export const startDineInSchema = z.object({ ...customer, customerBirthday, customerMarketingConsent });

// A guest filling in (or completing) their details later, from the menu page - every field is
// optional here since they might only be adding the one thing they skipped before.
export const updateOrderCustomerSchema = z
  .object({
    customerName: blankToUndefined(z.string().trim().min(1)),
    customerPhone: blankToUndefined(z.string().trim()),
    customerBirthday,
    customerMarketingConsent,
  })
  .refine(
    (v) =>
      v.customerName !== undefined ||
      v.customerPhone !== undefined ||
      v.customerBirthday !== undefined ||
      v.customerMarketingConsent !== undefined,
    { error: "Nothing to update" }
  );

export const startTakeawaySchema = z.object({ ...customer, customerBirthday });

export const startDeliverySchema = z.object({
  provider: z.enum(["Swiggy", "Zomato", "Uber-Eats", "Other"], { error: "A valid provider is required" }),
  ...customer,
  customerBirthday,
});

export const startCounterSchema = z.object({
  ...customer,
  customerBirthday,
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
  status: blankToUndefined(
    z.enum(["open", "billed", "unpaid", "closed", "cancelled"], { error: "Invalid order status" })
  ),
  today: blankToUndefined(z.string()),
  from: blankToUndefined(businessDate),
  to: blankToUndefined(businessDate),
});

const tenderMethod = z.enum(["cash", "upi", "card", "online", "wallet", "credit"], {
  error: "A valid paymentMethod (cash, upi, card, online, wallet, credit) is required",
});

const money = z
  .number({ error: "Enter an amount" })
  .positive({ error: "Payment amounts must be more than zero" })
  .max(10_000_000, { error: "That amount is too large" });

export const paymentLine = z.object({
  method: tenderMethod,
  amount: money,
  reference: blankToUndefined(z.string().trim().max(60, { error: "Keep the reference under 60 characters" })),
  tendered: z.number({ error: "Cash received must be a number" }).min(0).optional(),
});

export const settleSchema = z
  .object({
    paymentMethod: tenderMethod.optional(),
    payments: z.array(paymentLine).min(1, { error: "Add at least one payment" }).max(10).optional(),
  })
  .refine((body) => body.paymentMethod || body.payments, {
    error: "A valid paymentMethod (cash, upi, card, online, wallet, credit) is required",
  });

export const applyCouponSchema = z.object({
  code: z.string({ error: "code is required" }).trim().min(1, { error: "code is required" }),
});

export const ITEM_CANCEL_REASONS = ["wrong_item", "guest_changed_mind", "quality", "out_of_stock", "other"] as const;

export const cancelItemSchema = z.object({
  reason: blankToUndefined(z.enum(ITEM_CANCEL_REASONS, { error: "Choose a valid reason" })),
  note: z
    .string()
    .trim()
    .max(200, { error: "Keep the note under 200 characters" })
    .nullish()
    .transform((value) => value || undefined),
});

const reason = z
  .string({ error: "A reason is required" })
  .trim()
  .min(3, { error: "A reason is required" })
  .max(200, { error: "Keep the reason under 200 characters" });

export const reasonSchema = z.object({ reason });

export const cancelOrderSchema = z.object({ reason: blankToUndefined(reason) });

export const generateBillSchema = z.object({
  customerGstin: blankToUndefined(
    z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[0-9]{2}[A-Z0-9]{13}$/, { error: "Enter a valid 15-character GSTIN" })
  ),
});

export const invoiceRegisterQuery = z.object({
  from: blankToUndefined(businessDate),
  to: blankToUndefined(businessDate),
  number: blankToUndefined(z.string().trim().max(30, { error: "Invoice number search is too long" })),
  amount: blankToUndefined(
    z.coerce.number({ error: "Amount must be a number" }).min(0, { error: "Amount must be a number" })
  ),
});

export type StartDineInInput = z.output<typeof startDineInSchema>;
export type UpdateOrderCustomerInput = z.output<typeof updateOrderCustomerSchema>;
export type StartTakeawayInput = z.output<typeof startTakeawaySchema>;
export type StartDeliveryInput = z.output<typeof startDeliverySchema>;
export type StartCounterInput = z.output<typeof startCounterSchema>;
export type AddItemsInput = z.output<typeof addItemsSchema>;
export type OrderFilterInput = z.output<typeof orderFilterQuery>;
export type SettleInput = z.output<typeof settleSchema>;
export type CancelItemInput = z.output<typeof cancelItemSchema>;
export type GenerateBillInput = z.output<typeof generateBillSchema>;
export type InvoiceRegisterInput = z.output<typeof invoiceRegisterQuery>;

export const splitSchema = z.object({
  itemIds: z.array(objectId("Invalid item id")).min(1, { error: "Choose at least one item to move" }),
});

export const mergeSchema = z.object({ intoOrderId: objectId("Choose the order to merge into") });

export const transferSchema = z.object({ tableId: objectId("Choose a table") });

export const manualDiscountSchema = z.object({
  type: z.enum(["percent", "flat"], { error: "Choose percent or flat" }),
  value: z.number({ error: "Enter a discount value" }).positive({ error: "Enter a discount value" }),
  reason,
});

export const serviceChargeSchema = z.object({ waived: z.boolean({ error: "waived must be true or false" }) });

export type SplitInput = z.output<typeof splitSchema>;
export type ManualDiscountInput = z.output<typeof manualDiscountSchema>;
