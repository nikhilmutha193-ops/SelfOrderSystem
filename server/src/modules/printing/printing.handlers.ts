import { on } from "../../core/events";
import Restaurant from "../../models/Restaurant";
import { enqueueBill, enqueueKot } from "./printing.service";

let registered = false;

export function registerPrintingHandlers(): void {
  if (registered) return;
  registered = true;

  on("order.kotSent", async (event) => {
    await enqueueKot(event.restaurantId, event.orderId, event.round);
  });

  on("order.billed", async (event) => {
    const restaurant = await Restaurant.findById(event.restaurantId).select("invoiceSettings");
    if (restaurant?.invoiceSettings?.autoPrintBill) await enqueueBill(event.restaurantId, event.orderId);
  });
}
