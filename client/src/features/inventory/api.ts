import type {
  PurchaseRecord,
  RecipeLine,
  RecipeModifierLine,
  RecipeRow,
  StockCountRecord,
  StockItem,
  StockItemInput,
  StockUnit,
  StockMovement,
  UsageReport,
  Vendor,
} from "../../lib/types";
import { api } from "../../shared/api/client";

export interface DateRange {
  from?: string;
  to?: string;
}

export interface MovementInput {
  stockItemId: string;
  type: "opening" | "wastage" | "adjustment";
  quantity: number;
  unitCost?: number;
  note?: string;
}

export interface PurchaseInput {
  vendorId?: string;
  invoiceRef?: string;
  purchasedOn?: string;
  lines: { stockItemId: string; quantity: number; unitPrice: number }[];
}

export interface StockImportRow {
  row: number;
  name: string;
  unit: StockUnit | null;
  action: "create" | "add" | "update" | "unchanged" | "error";
  quantity: number;
  before: number;
  after: number;
  cost: number | null;
  notes: string[];
  error?: string;
}

export interface StockImportPreview {
  counts: { rows: number; create: number; add: number; update: number; unchanged: number; error: number; blank: number };
  rows: StockImportRow[];
  unknownHeaders: string[];
}

export interface StockImportResult {
  message: string;
  created: number;
  added: number;
  updated: number;
  unchanged: number;
  skipped: number;
  errors: StockImportRow[];
}

export interface CountImportRow {
  row: number;
  name: string;
  unit: StockUnit | null;
  action: "count" | "skip" | "error";
  expected: number;
  counted: number | null;
  variance: number;
  value: number;
  note?: string;
  error?: string;
}

export interface CountImportPreview {
  counts: {
    rows: number;
    counted: number;
    different: number;
    skipped: number;
    error: number;
    blank: number;
    varianceValue: number;
  };
  rows: CountImportRow[];
  unknownHeaders: string[];
}

export interface CountImportResult {
  message: string;
  countId: string;
  counted: number;
  different: number;
  skipped: number;
  problems: number;
  varianceValue: number;
  errors: CountImportRow[];
}

export const inventoryApi = {
  countPreview: (rows: Record<string, unknown>[]) =>
    api.post<CountImportPreview>("/inventory/counts/import/preview", { rows }).then((res) => res.data),
  countApply: (rows: Record<string, unknown>[], note?: string) =>
    api.post<CountImportResult>("/inventory/counts/import/apply", { rows, note }).then((res) => res.data),
  importPreview: (rows: Record<string, unknown>[]) =>
    api.post<StockImportPreview>("/inventory/import/preview", { rows }).then((res) => res.data),
  importApply: (rows: Record<string, unknown>[]) =>
    api.post<StockImportResult>("/inventory/import/apply", { rows }).then((res) => res.data),
  items: () => api.get<StockItem[]>("/inventory/items").then((res) => res.data),
  createItem: (input: StockItemInput) => api.post<StockItem>("/inventory/items", input).then((res) => res.data),
  updateItem: ({ id, input }: { id: string; input: StockItemInput }) =>
    api.put<StockItem>(`/inventory/items/${id}`, input).then((res) => res.data),
  deleteItem: (id: string) => api.delete(`/inventory/items/${id}`).then(() => undefined),
  ledger: (id: string) =>
    api
      .get<{ item: StockItem; movements: StockMovement[] }>(`/inventory/items/${id}/movements`)
      .then((res) => res.data),
  move: (input: MovementInput) => api.post<StockItem>("/inventory/movements", input).then((res) => res.data),
  recipes: () => api.get<RecipeRow[]>("/inventory/recipes").then((res) => res.data),
  saveRecipe: ({
    foodItemId,
    lines,
    modifierLines,
  }: {
    foodItemId: string;
    lines: RecipeLine[];
    modifierLines: RecipeModifierLine[];
  }) => api.put<RecipeRow>(`/inventory/recipes/${foodItemId}`, { lines, modifierLines }).then((res) => res.data),
  vendors: () => api.get<Vendor[]>("/inventory/vendors").then((res) => res.data),
  createVendor: (input: Omit<Vendor, "_id">) => api.post<Vendor>("/inventory/vendors", input).then((res) => res.data),
  purchases: (range: DateRange) =>
    api
      .get<{ from: string; to: string; purchases: PurchaseRecord[]; total: number }>("/inventory/purchases", {
        params: range,
      })
      .then((res) => res.data),
  createPurchase: (input: PurchaseInput) =>
    api.post<PurchaseRecord>("/inventory/purchases", input).then((res) => res.data),
  counts: () => api.get<StockCountRecord[]>("/inventory/counts").then((res) => res.data),
  createCount: (input: { note?: string; lines: { stockItemId: string; counted: number }[] }) =>
    api.post<StockCountRecord>("/inventory/counts", input).then((res) => res.data),
  usage: (range: DateRange) =>
    api.get<UsageReport>("/inventory/reports/usage", { params: range }).then((res) => res.data),
  settings: () => api.get<{ autoSoldOut: boolean }>("/inventory/settings").then((res) => res.data),
  saveSettings: (autoSoldOut: boolean) =>
    api.put<{ autoSoldOut: boolean }>("/inventory/settings", { autoSoldOut }).then((res) => res.data),
};
