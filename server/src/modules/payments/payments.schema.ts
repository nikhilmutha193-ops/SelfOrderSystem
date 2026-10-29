import { z } from "zod";

import { objectId } from "../../core/validate";

export const orderIdParams = z.object({ orderId: objectId() });

export const gatewaySettingsSchema = z.object({
  enabled: z.boolean({ error: "Choose whether online payment is on" }).optional(),
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
