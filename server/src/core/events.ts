import { describeError, logger } from "../utils/logger";

interface OrderRef {
  restaurantId: string;
  orderId: string;
}

export interface DomainEvents {
  "order.created": OrderRef;
  "order.itemsAdded": OrderRef & { itemIds: string[]; addedByRole: "admin" | "chef" | "table" };
  "order.itemCancelled": OrderRef & { itemId: string; previousStatus: string };
  "order.kotSent": OrderRef & { round: number; tokenNumber: number; itemIds: string[]; silent?: boolean };
  "order.billed": OrderRef;
  "order.settled": OrderRef;
  "order.cancelled": OrderRef & { voided: boolean };
  "booking.confirmed": { restaurantId: string; bookingId: string };
  "booking.cancelled": { restaurantId: string; bookingId: string; status: "cancelled" | "no_show" };
}

export type DomainEventName = keyof DomainEvents;

type Handler<K extends DomainEventName> = (payload: DomainEvents[K]) => void | Promise<void>;

const handlers = new Map<DomainEventName, Set<Handler<DomainEventName>>>();

export function on<K extends DomainEventName>(event: K, handler: Handler<K>): () => void {
  const set = handlers.get(event) ?? new Set();
  set.add(handler as Handler<DomainEventName>);
  handlers.set(event, set);
  return () => set.delete(handler as Handler<DomainEventName>);
}

export async function emit<K extends DomainEventName>(event: K, payload: DomainEvents[K]): Promise<void> {
  for (const handler of handlers.get(event) ?? []) {
    try {
      await handler(payload);
    } catch (err) {
      logger.error("event handler failed", { event, ...describeError(err) });
    }
  }
}
