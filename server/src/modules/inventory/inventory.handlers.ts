import { on } from "../../core/events";
import { consumeForKot, settleCancelledItems, settleCancelledOrder } from "./inventory.service";

let registered = false;

export function registerInventoryHandlers(): void {
  if (registered) return;
  registered = true;

  on("order.kotSent", async (event) => {
    await consumeForKot(event.restaurantId, event.itemIds);
  });

  on("order.itemCancelled", async (event) => {
    await settleCancelledItems(event.restaurantId, [
      { itemId: event.itemId, cooked: event.previousStatus !== "pending" },
    ]);
  });

  on("order.cancelled", async (event) => {
    if (!event.voided) await settleCancelledOrder(event.restaurantId, event.orderId);
  });
}
