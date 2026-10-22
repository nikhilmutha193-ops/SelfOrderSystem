import { z } from "zod";

const businessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Dates must be in YYYY-MM-DD format" });

export const gstReportQuery = z
  .object({
    from: businessDate,
    to: businessDate,
  })
  .refine((v) => v.from <= v.to, { error: "The start date must be on or before the end date" });

export type GstReportInput = z.output<typeof gstReportQuery>;
