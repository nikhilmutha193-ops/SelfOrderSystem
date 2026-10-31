import { z } from "zod";

import { objectId } from "../../core/validate";
import { DISPLAY_FITS, DISPLAY_TRANSITIONS } from "../../models/Display";

const imageUrl = z
  .string({ error: "Each slide needs an image" })
  .trim()
  .min(1, { error: "Each slide needs an image" })
  .max(500, { error: "That image address is too long" })
  .refine((v) => v.startsWith("/uploads/") || /^https:\/\//i.test(v), {
    error: "Upload the image or use an https:// address",
  });

const slide = z.object({
  url: imageUrl,
  caption: z
    .string()
    .trim()
    .max(120, { error: "Keep captions under 120 characters" })
    .optional()
    .transform((v) => v || undefined),
  seconds: z
    .number({ error: "Seconds must be a number" })
    .int({ error: "Seconds must be a whole number" })
    .min(2, { error: "A slide stays up for at least 2 seconds" })
    .max(300, { error: "A slide stays up for at most 300 seconds" })
    .optional(),
});

const fields = {
  name: z
    .string({ error: "Give the display a name" })
    .trim()
    .min(1, { error: "Give the display a name" })
    .max(60, { error: "Keep the name under 60 characters" }),
  active: z.boolean({ error: "Choose whether the display is on" }),
  slides: z
    .array(slide, { error: "Slides must be a list" })
    .max(50, { error: "Use at most 50 slides" }),
  intervalSeconds: z
    .number({ error: "Seconds must be a number" })
    .int({ error: "Seconds must be a whole number" })
    .min(2, { error: "A slide stays up for at least 2 seconds" })
    .max(300, { error: "A slide stays up for at most 300 seconds" }),
  transition: z.enum(DISPLAY_TRANSITIONS, { error: "Choose a transition" }),
  fit: z.enum(DISPLAY_FITS, { error: "Choose how the image fits" }),
  showCaptions: z.boolean({ error: "Choose whether captions show" }),
};

export const createDisplaySchema = z.object({
  name: fields.name,
  active: fields.active.optional(),
  slides: fields.slides.optional(),
  intervalSeconds: fields.intervalSeconds.optional(),
  transition: fields.transition.optional(),
  fit: fields.fit.optional(),
  showCaptions: fields.showCaptions.optional(),
});

export const updateDisplaySchema = createDisplaySchema.partial();

export const displayParams = z.object({ id: objectId("Invalid display") });

export const publicDisplayParams = z.object({
  code: z
    .string()
    .regex(/^[A-Za-z0-9_-]{10,40}$/, { error: "Display not found" }),
});

export type CreateDisplayInput = z.output<typeof createDisplaySchema>;
export type UpdateDisplayInput = z.output<typeof updateDisplaySchema>;
