import { z } from "zod";

export const menuEngineeringQuery = z.object({
  days: z.coerce
    .number({ error: "Choose a period in days" })
    .int({ error: "Choose a period in days" })
    .min(1, { error: "Choose at least 1 day" })
    .max(365, { error: "Choose at most 365 days" })
    .default(30),
});
