import { z } from "zod";

export const MAX_IMPORT_ROWS = 3000;

export const importSchema = z.object({
  // One object per spreadsheet row: the header text as the key, the cell as the value.
  rows: z
    .array(z.record(z.string(), z.unknown()), { error: "rows must be a list" })
    .min(1, { error: "The file has no rows to import" })
    .max(MAX_IMPORT_ROWS, { error: `Import at most ${MAX_IMPORT_ROWS} dishes at a time` }),
  // Which columns to take from the file; the rest are left alone. Omitted = every column the file has.
  fields: z.array(z.string()).optional(),
  // insert: add new dishes, leave duplicates alone. upsert: also update the duplicates. replace: upsert, and hide
  // every dish that is not in the file.
  mode: z.enum(["insert", "upsert", "replace"], { error: "Choose how to import" }).default("insert"),
  // Create categories and subcategories that are in the file but not on the menu yet.
  createMissing: z.boolean().default(true),
});

export type ImportInput = z.output<typeof importSchema>;
