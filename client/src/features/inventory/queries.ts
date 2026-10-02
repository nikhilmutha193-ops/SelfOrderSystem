import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { inventoryApi, type DateRange } from "./api";

export const inventoryKeys = {
  all: ["inventory"] as const,
  items: ["inventory", "items"] as const,
  ledger: (id: string) => ["inventory", "ledger", id] as const,
  recipes: ["inventory", "recipes"] as const,
  vendors: ["inventory", "vendors"] as const,
  purchases: (range: DateRange) => ["inventory", "purchases", range] as const,
  counts: ["inventory", "counts"] as const,
  usage: (range: DateRange) => ["inventory", "usage", range] as const,
  settings: ["inventory", "settings"] as const,
};

export const useStockItems = () => useQuery({ queryKey: inventoryKeys.items, queryFn: inventoryApi.items });

export const useLedger = (id: string | null) =>
  useQuery({ queryKey: inventoryKeys.ledger(id ?? ""), queryFn: () => inventoryApi.ledger(id!), enabled: !!id });

export const useRecipes = () => useQuery({ queryKey: inventoryKeys.recipes, queryFn: inventoryApi.recipes });

export const useVendors = () => useQuery({ queryKey: inventoryKeys.vendors, queryFn: inventoryApi.vendors });

export const usePurchases = (range: DateRange) =>
  useQuery({ queryKey: inventoryKeys.purchases(range), queryFn: () => inventoryApi.purchases(range) });

export const useCounts = () => useQuery({ queryKey: inventoryKeys.counts, queryFn: inventoryApi.counts });

export const useUsage = (range: DateRange) =>
  useQuery({ queryKey: inventoryKeys.usage(range), queryFn: () => inventoryApi.usage(range) });

export const useInventorySettings = () =>
  useQuery({ queryKey: inventoryKeys.settings, queryFn: inventoryApi.settings });

function useInventoryMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["catalog"] }),
      ]),
  });
}

export const useCreateStockItem = () => useInventoryMutation(inventoryApi.createItem);
export const useUpdateStockItem = () => useInventoryMutation(inventoryApi.updateItem);
export const useDeleteStockItem = () => useInventoryMutation(inventoryApi.deleteItem);
export const useMoveStock = () => useInventoryMutation(inventoryApi.move);
export const useSaveRecipe = () => useInventoryMutation(inventoryApi.saveRecipe);
export const useCreateVendor = () => useInventoryMutation(inventoryApi.createVendor);
export const useCreatePurchase = () => useInventoryMutation(inventoryApi.createPurchase);
export const useCreateCount = () => useInventoryMutation(inventoryApi.createCount);
export const useSaveInventorySettings = () => useInventoryMutation(inventoryApi.saveSettings);
