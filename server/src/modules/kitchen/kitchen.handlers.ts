import { on } from "../../core/events";
import { sendGuestItemsIfAutomatic } from "./kitchen.service";

let registered = false;

export function registerKitchenHandlers(): void {
  if (registered) return;
  registered = true;

  on("order.itemsAdded", async (event) => {
    if (event.addedByRole === "table") await sendGuestItemsIfAutomatic(event.restaurantId, event.orderId);
  });
}
