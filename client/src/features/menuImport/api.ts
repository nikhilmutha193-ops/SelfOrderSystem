import { api } from "../../shared/api/client";
import { readSpreadsheet } from "../../shared/export/readSpreadsheet";

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

export const readMenuFile = (file: File) => readSpreadsheet(file, "dishes");
