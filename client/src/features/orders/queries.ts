import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import type { DeliveryProvider, ItemCancelReason, PaymentMethod } from "../../lib/types";
import {
  ordersApi,
  type CustomerInput,
  type DiscountInput,
  type InvoiceRegisterFilters,
  type NewOrderLine,
  type OrderFilters,
  type PaymentLine,
} from "./api";

export const orderKeys = {
  all: ["orders"] as const,
  list: (filters: OrderFilters) => ["orders", "list", filters] as const,
  detail: (orderId: string) => ["orders", "detail", orderId] as const,
  invoice: (orderId: string) => ["orders", "invoice", orderId] as const,
  coupons: (orderId: string, subtotal: number | undefined) => ["orders", "coupons", orderId, subtotal] as const,
  invoices: (filters: InvoiceRegisterFilters) => ["orders", "invoices", filters] as const,
};

export function refreshOrderData(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: orderKeys.all }),
    queryClient.invalidateQueries({ queryKey: ["kitchen"] }),
    queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
  ]);
}

export function useOrders(filters: OrderFilters, options: { enabled?: boolean; refetchInterval?: number } = {}) {
  return useQuery({
    queryKey: orderKeys.list(filters),
    queryFn: () => ordersApi.list(filters),
    ...options,
  });
}

export function useOrder(orderId: string | undefined, refetchInterval?: number) {
  return useQuery({
    queryKey: orderKeys.detail(orderId ?? ""),
    queryFn: () => ordersApi.get(orderId!),
    enabled: !!orderId,
    refetchInterval,
  });
}

export function useOrderInvoice(orderId: string | undefined, refetchInterval?: number) {
  return useQuery({
    queryKey: orderKeys.invoice(orderId ?? ""),
    queryFn: () => ordersApi.invoice(orderId!),
    enabled: !!orderId,
    refetchInterval,
  });
}

export function useOrderCoupons(orderId: string | undefined, subtotal: number | undefined) {
  return useQuery({
    queryKey: orderKeys.coupons(orderId ?? "", subtotal),
    queryFn: () => ordersApi.coupons(orderId!).then((data) => data.coupons),
    enabled: !!orderId,
  });
}

function useOrderMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn, onSuccess: () => refreshOrderData(queryClient) });
}

export function usePayOrder() {
  return useOrderMutation(({ orderId, paymentMethod }: { orderId: string; paymentMethod: PaymentMethod }) =>
    ordersApi.pay(orderId, paymentMethod)
  );
}

export function useCancelOrder() {
  return useOrderMutation(({ orderId, reason }: { orderId: string; reason?: string }) =>
    ordersApi.cancel(orderId, reason)
  );
}

export function useCancelOrderItem() {
  return useOrderMutation(({ itemId, reason, note }: { itemId: string; reason?: ItemCancelReason; note?: string }) =>
    ordersApi.cancelItem(itemId, reason, note)
  );
}

export function useUpdateOrderCustomer() {
  return useOrderMutation(({ orderId, input }: { orderId: string; input: Partial<CustomerInput> }) =>
    ordersApi.updateCustomer(orderId, input)
  );
}

export function useGenerateBill() {
  return useOrderMutation(({ orderId, customerGstin }: { orderId: string; customerGstin?: string }) =>
    ordersApi.generateBill(orderId, customerGstin)
  );
}

export function useReopenBill() {
  return useOrderMutation(({ orderId, reason }: { orderId: string; reason: string }) =>
    ordersApi.reopenBill(orderId, reason)
  );
}

export function useVoidBill() {
  return useOrderMutation(({ orderId, reason }: { orderId: string; reason: string }) =>
    ordersApi.voidBill(orderId, reason)
  );
}

export function useInvoiceRegister(filters: InvoiceRegisterFilters) {
  return useQuery({ queryKey: orderKeys.invoices(filters), queryFn: () => ordersApi.invoices(filters) });
}

export function useAddOrderItems() {
  return useOrderMutation(({ orderId, items }: { orderId: string; items: NewOrderLine[] }) =>
    ordersApi.addItems(orderId, items)
  );
}

export function useApplyCoupon() {
  return useOrderMutation(({ orderId, code }: { orderId: string; code: string }) =>
    ordersApi.applyCoupon(orderId, code)
  );
}

export function useRemoveCoupon() {
  return useOrderMutation((orderId: string) => ordersApi.removeCoupon(orderId));
}

export function useSettleOrder() {
  return useOrderMutation(({ orderId, payments }: { orderId: string; payments: PaymentLine[] }) =>
    ordersApi.settle(orderId, payments)
  );
}

export function useSplitOrder() {
  return useOrderMutation(({ orderId, itemIds }: { orderId: string; itemIds: string[] }) =>
    ordersApi.split(orderId, itemIds)
  );
}

export function useMergeOrder() {
  return useOrderMutation(({ orderId, intoOrderId }: { orderId: string; intoOrderId: string }) =>
    ordersApi.merge(orderId, intoOrderId)
  );
}

export function useTransferOrder() {
  return useOrderMutation(({ orderId, tableId }: { orderId: string; tableId: string }) =>
    ordersApi.transfer(orderId, tableId)
  );
}

export function useSetDiscount() {
  return useOrderMutation(({ orderId, input }: { orderId: string; input: DiscountInput | null }) =>
    input ? ordersApi.setDiscount(orderId, input) : ordersApi.removeDiscount(orderId)
  );
}

export function useSetServiceCharge() {
  return useOrderMutation(({ orderId, waived }: { orderId: string; waived: boolean }) =>
    ordersApi.setServiceCharge(orderId, waived)
  );
}

export function useComplimentary() {
  return useOrderMutation(({ itemId, reason }: { itemId: string; reason: string }) =>
    ordersApi.complimentary(itemId, reason)
  );
}

export function useFreeTables(enabled: boolean) {
  return useQuery({ queryKey: ["tables", "free"], queryFn: ordersApi.freeTables, enabled });
}

export function useArchiveOrders() {
  return useOrderMutation((filters: OrderFilters) => ordersApi.archive(filters));
}

export type StartOrderInput =
  | ({ kind: "dine-in" } & CustomerInput)
  | ({ kind: "takeaway" } & CustomerInput)
  | ({ kind: "delivery"; provider: DeliveryProvider } & CustomerInput);

export function useStartStaffOrder() {
  return useOrderMutation((input: StartOrderInput) => {
    const { kind, ...rest } = input;
    if (kind === "delivery") return ordersApi.startDelivery(rest as CustomerInput & { provider: DeliveryProvider });
    if (kind === "takeaway") return ordersApi.startTakeaway(rest);
    return ordersApi.startCounter(rest);
  });
}
