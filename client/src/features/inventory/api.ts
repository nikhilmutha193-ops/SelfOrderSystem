import type {
  PurchaseRecord,
  RecipeLine,
  RecipeModifierLine,
  RecipeRow,
  StockCountRecord,
  StockItem,
  StockItemInput,
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

export const inventoryApi = {
  items: () => api.get<StockItem[]>("/inventory/items").then((res) => res.data),
  createItem: (input: StockItemInput) => api.post<StockItem>("/inventory/items", input).then((res) => res.data),
  updateItem: ({ id, input }: { id: string; input: StockItemInput }) =>
    api.put<StockItem>(`/inventory/items/${id}`, input).then((res) => res.data),
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
