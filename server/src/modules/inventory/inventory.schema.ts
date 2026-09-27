import { z } from "zod";

import { blankToUndefined, objectId } from "../../core/validate";

const name = z
  .string({ error: "A name is required" })
  .trim()
  .min(1, { error: "A name is required" })
  .max(60, { error: "Keep the name under 60 characters" });

const quantity = (message: string) =>
  z.number({ error: message }).refine((n) => Number.isFinite(n) && n > 0, { error: message });

const note = z
  .string()
  .nullish()
  .transform((value) => (value ?? "").trim().slice(0, 200));

const businessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Dates must be in YYYY-MM-DD format" });

export const idParams = z.object({ id: objectId() });
export const foodParams = z.object({ foodItemId: objectId("Invalid food item") });

export const stockItemSchema = z.object({
  name,
  unit: z.enum(["g", "ml", "pcs"], { error: "Unit must be grams, millilitres or pieces" }),
  purchaseUnit: z
    .string()
    .nullish()
    .transform((value) => (value ?? "").trim().slice(0, 12)),
  purchaseFactor: z
    .number({ error: "Units per purchase unit must be a number" })
    .min(1, { error: "Units per purchase unit must be at least 1" })
    .default(1),
  reorderLevel: z
    .number({ error: "Reorder level must be a number" })
    .min(0, { error: "Reorder level can't be negative" })
    .default(0),
  isActive: z.boolean().default(true),
});

export const movementSchema = z
  .object({
    stockItemId: objectId("Choose a stock item"),
    type: z.enum(["opening", "wastage", "adjustment"], { error: "Choose opening stock, wastage or adjustment" }),
    quantity: z
      .number({ error: "Enter a quantity" })
      .refine((n) => Number.isFinite(n) && n !== 0, { error: "Enter a quantity" }),
    unitCost: z.number().min(0, { error: "Cost can't be negative" }).nullish(),
    note,
  })
  .refine((m) => m.type === "adjustment" || m.quantity > 0, {
    error: "Enter a positive quantity",
    path: ["quantity"],
  })
  .refine((m) => m.type === "opening" || m.note.length > 0, {
    error: "Add a reason for wastage or adjustments",
    path: ["note"],
  });

export const recipeSchema = z.object({
  lines: z.array(
    z.object({
      stockItemId: objectId("Choose an ingredient"),
      quantity: quantity("Each ingredient needs a quantity above zero"),
      key: z.boolean().default(false),
    })
  ),
  modifierLines: z
    .array(
      z.object({
        groupName: z.string().trim().min(1),
        label: z.string().trim().min(1),
        stockItemId: objectId("Choose an ingredient"),
        quantity: quantity("Each extra needs a quantity above zero"),
      })
    )
    .default([]),
});

export const vendorSchema = z.object({
  name,
  phone: z
    .string()
    .nullish()
    .transform((value) => (value ?? "").trim().slice(0, 20)),
  gstin: z
    .string()
    .nullish()
    .transform((value) => (value ?? "").trim().toUpperCase())
    .refine((value) => value === "" || /^[0-9A-Z]{15}$/.test(value), { error: "GSTIN has 15 letters or digits" }),
});

export const purchaseSchema = z.object({
  vendorId: blankToUndefined(objectId("Choose a vendor")),
  invoiceRef: z
    .string()
    .nullish()
    .transform((value) => (value ?? "").trim().slice(0, 40)),
  purchasedOn: blankToUndefined(businessDate),
  lines: z
    .array(
      z.object({
        stockItemId: objectId("Choose a stock item"),
        quantity: quantity("Each line needs a quantity above zero"),
        unitPrice: z.number({ error: "Enter a price" }).min(0, { error: "Price can't be negative" }),
      }),
      { error: "Add at least one item" }
    )
    .min(1, { error: "Add at least one item" }),
});

export const countSchema = z.object({
  note,
  lines: z
    .array(
      z.object({
        stockItemId: objectId("Choose a stock item"),
        counted: z.number({ error: "Enter the counted quantity" }).min(0, { error: "Counted stock can't be negative" }),
      }),
      { error: "Count at least one item" }
    )
    .min(1, { error: "Count at least one item" }),
});

export const rangeQuery = z.object({
  from: blankToUndefined(businessDate),
  to: blankToUndefined(businessDate),
});

export const settingsSchema = z.object({
  autoSoldOut: z.boolean({ error: "autoSoldOut must be true or false" }),
});

export type StockItemInput = z.output<typeof stockItemSchema>;
export type MovementInput = z.output<typeof movementSchema>;
export type RecipeInput = z.output<typeof recipeSchema>;
export type VendorInput = z.output<typeof vendorSchema>;
export type PurchaseInput = z.output<typeof purchaseSchema>;
export type CountInput = z.output<typeof countSchema>;
