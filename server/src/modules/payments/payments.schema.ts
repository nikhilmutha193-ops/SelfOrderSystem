import { z } from "zod";

import { objectId } from "../../core/validate";

export const orderIdParams = z.object({ orderId: objectId() });

export const gatewaySettingsSchema = z.object({
  enabled: z.boolean({ error: "Choose whether online payment is on" }).optional(),
  provider: z.enum(["razorpay", "paytm"], { error: "Choose Razorpay or Paytm" }).optional(),
  paytmMid: z
    .string({ error: "The Merchant ID must be text" })
    .trim()
    .regex(/^[A-Za-z0-9_-]{0,40}$/, { error: "Enter the Merchant ID exactly as the Paytm dashboard shows it" })
    .optional(),
  // Blank or missing keeps the saved merchant key. A Paytm key is 16 characters.
  paytmKey: z
    .string({ error: "The Merchant Key must be text" })
    .trim()
    .regex(/^(.{16})?$/, { error: "The Paytm Merchant Key is 16 characters long" })
    .optional(),
  paytmWebsite: z
    .string({ error: "The website name must be text" })
    .trim()
    .regex(/^[A-Za-z0-9_-]{0,30}$/, { error: "Enter the website name from the Paytm dashboard, e.g. DEFAULT" })
    .optional(),
  paytmEnvironment: z.enum(["staging", "production"], { error: "Choose staging or production" }).optional(),
  keyId: z
    .string({ error: "Key ID must be text" })
    .trim()
    .regex(/^(rzp_(test|live)_[A-Za-z0-9]{6,40})?$/, { error: "The key ID starts with rzp_live_ or rzp_test_" })
    .optional(),
  // Blank or missing keeps the saved secret.
  keySecret: z.string({ error: "Key secret must be text" }).trim().max(200).optional(),
  webhookSecret: z.string({ error: "Webhook secret must be text" }).trim().max(200).optional(),
});

export type GatewaySettingsInput = z.output<typeof gatewaySettingsSchema>;

const gatewayId = (label: string) =>
  z.string({ error: `${label} is missing` }).trim().min(1, { error: `${label} is missing` }).max(100);

export const confirmCheckoutSchema = z.object({
  razorpay_order_id: gatewayId("The payment order"),
  razorpay_payment_id: gatewayId("The payment"),
  razorpay_signature: gatewayId("The payment signature"),
});

export type ConfirmCheckoutInput = z.output<typeof confirmCheckoutSchema>;

export const confirmPaytmSchema = z.object({ orderId: gatewayId("The payment order") });

export type ConfirmPaytmInput = z.output<typeof confirmPaytmSchema>;
