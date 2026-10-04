import { on } from "../../core/events";
import { applyCustomerUpdate, linkOrder, onCancelled, onSettled } from "./customers.service";

let registered = false;

export function registerCustomerHandlers(): void {
  if (registered) return;
  registered = true;

  on("order.created", async (event) => {
    await linkOrder(event.restaurantId, event.orderId, event.customerBirthday);
  });

  on("order.customerUpdated", async (event) => {
    await applyCustomerUpdate(event.restaurantId, event.orderId, event.customerBirthday);
  });

  on("order.settled", async (event) => {
    await onSettled(event.restaurantId, event.orderId);
  });

  on("order.cancelled", async (event) => {
    await onCancelled(event.restaurantId, event.orderId, event.voided);
  });
}
