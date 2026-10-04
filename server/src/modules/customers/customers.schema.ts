import { z } from "zod";

import { blankToUndefined, objectId } from "../../core/validate";

const monthDay = z
  .string()
  .trim()
  .refine((value) => value === "" || /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value), {
    error: "Dates are month and day, like 08-15",
  });

export const idParams = z.object({ id: objectId() });
export const orderParams = z.object({ orderId: objectId() });
export const tokenParams = z.object({ token: z.string().min(20).max(2000) });

export const listQuery = z.object({
  segment: blankToUndefined(z.enum(["regulars", "lapsed", "birthdays", "consented"], { error: "Unknown segment" })),
  q: blankToUndefined(z.string().trim().max(60)),
});

export const lookupQuery = z.object({
  phone: z.string({ error: "Enter a phone number" }).trim().min(1, { error: "Enter a phone number" }),
});

export const attachSchema = z.object({
  phone: z.string({ error: "Enter a phone number" }).trim().min(1, { error: "Enter a phone number" }),
  name: z
    .string()
    .nullish()
    .transform((value) => (value ?? "").trim().slice(0, 80)),
});

export const updateCustomerSchema = z.object({
  name: z.string().trim().max(80),
  birthday: monthDay.default(""),
  anniversary: monthDay.default(""),
  tags: z
    .array(z.string().trim().min(1).max(20), { error: "Tags must be a list" })
    .max(10, { error: "Use at most 10 tags" })
    .default([]),
  marketingConsent: z.boolean().default(false),
});

export const redeemSchema = z.object({
  points: z
    .number({ error: "Enter the points to redeem" })
    .int({ error: "Points must be a whole number" })
    .min(1, { error: "Enter the points to redeem" }),
});

export const loyaltySettingsSchema = z.object({
  enabled: z.boolean(),
  pointsPer100: z
    .number()
    .min(0, { error: "Points per ₹100 can't be negative" })
    .max(100, { error: "Keep points per ₹100 at 100 or less" }),
  pointValue: z
    .number()
    .min(0, { error: "Point value can't be negative" })
    .max(100, { error: "Keep a point's value at ₹100 or less" }),
  minRedeem: z.number().int().min(0, { error: "Minimum points can't be negative" }),
  expiryDays: z.number().int().min(0, { error: "Expiry can't be negative" }),
});

export const birthdaySmsSettingsSchema = z.object({
  enabled: z.boolean(),
  template: z
    .string({ error: "Write a message template" })
    .trim()
    .min(1, { error: "Write a message template" })
    .max(300, { error: "Keep the template under 300 characters" }),
});

export const smsTemplateSchema = z.object({
  name: z
    .string({ error: "Name the template" })
    .trim()
    .min(1, { error: "Name the template" })
    .max(60, { error: "Keep the name under 60 characters" }),
  message: z
    .string({ error: "Write a message" })
    .trim()
    .min(1, { error: "Write a message" })
    .max(300, { error: "Keep the message under 300 characters" }),
});

export const sendCampaignSchema = z.object({
  message: z
    .string({ error: "Write a message" })
    .trim()
    .min(1, { error: "Write a message" })
    .max(300, { error: "Keep the message under 300 characters" }),
});

export type UpdateCustomerInput = z.output<typeof updateCustomerSchema>;
export type LoyaltySettingsInput = z.output<typeof loyaltySettingsSchema>;
export type BirthdaySmsSettingsInput = z.output<typeof birthdaySmsSettingsSchema>;
export type SmsTemplateInput = z.output<typeof smsTemplateSchema>;
export type SendCampaignInput = z.output<typeof sendCampaignSchema>;
