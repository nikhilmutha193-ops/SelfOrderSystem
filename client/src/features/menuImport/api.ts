import { api } from "../../shared/api/client";

export type ImportMode = "insert" | "upsert" | "replace";
export type ImportAction = "insert" | "update" | "unchanged" | "duplicate" | "error";

export interface ImportRequest {
  rows: Record<string, unknown>[];
  fields?: string[];
  mode: ImportMode;
  createMissing: boolean;
}

export interface ImportField {
  key: string;
  label: string;
  locked: boolean;
  selected: boolean;
}

export interface ImportRow {
  row: number;
  name: string;
  category: string;
  subcategory: string;
  action: ImportAction;
  changes: string[];
  note?: string;
}

export interface ImportPreview {
  counts: {
    rows: number;
    insert: number;
    update: number;
    unchanged: number;
    duplicate: number;
    error: number;
    remove: number;
    blank: number;
    newCategories: number;
    newSubcategories: number;
  };
  fields: ImportField[];
  unknownHeaders: string[];
  rows: ImportRow[];
  rowsShown: number;
  toRemove: { name: string; category: string }[];
}

export interface ImportResult {
  message: string;
  inserted: number;
  updated: number;
  unchanged: number;
  duplicates: number;
  hidden: number;
  skipped: number;
  createdCategories: number;
  createdSubcategories: number;
  errors: ImportRow[];
}

export interface MenuExport {
  columns: { key: string; label: string }[];
  rows: Record<string, string | number | null>[];
}

export const menuImportApi = {
  export: () => api.get<MenuExport>("/menu-import/export").then((res) => res.data),
  preview: (body: ImportRequest) => api.post<ImportPreview>("/menu-import/preview", body).then((res) => res.data),
  apply: (body: ImportRequest) => api.post<ImportResult>("/menu-import/apply", body).then((res) => res.data),
};

type Cell = string | number | boolean | Date | null | undefined;

/** Reads the first sheet of an .xlsx file, or a .csv file, into one object per row, keyed by the header in row 1. */
export async function readMenuFile(file: File): Promise<Record<string, unknown>[]> {
  let table: Cell[][];
  if (/\.csv$/i.test(file.name)) {
    const { parseCsv } = await import("../../shared/export/excel");
    table = parseCsv(await file.text());
  } else {
    const { readSheet } = await import("read-excel-file/browser");
    table = (await readSheet(file)) as Cell[][];
  }
  if (table.length < 2) throw new Error("The file has a header row but no dishes under it");
  const headers = table[0].map((h) => String(h ?? "").trim());
  return table.slice(1).map((cells) => {
    const row: Record<string, unknown> = {};
    headers.forEach((header, i) => {
      if (!header) return;
      const cell = cells[i];
      row[header] = cell instanceof Date ? cell.toISOString() : (cell ?? "");
    });
    return row;
  });
}
