import { on } from "../../core/events";
import { onOrderSettled, onOrderVoided } from "./credit.service";

let registered = false;

export function registerCreditHandlers(): void {
  if (registered) return;
  registered = true;

  on("order.settled", async (event) => {
    await onOrderSettled(event.restaurantId, event.orderId);
  });

  on("order.cancelled", async (event) => {
    if (event.voided) await onOrderVoided(event.restaurantId, event.orderId);
  });
}
