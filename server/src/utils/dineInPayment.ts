import { Types } from "mongoose";

import { IOrder } from "../models/Order";
import Restaurant, { IRestaurant } from "../models/Restaurant";

type WithBilling = Pick<IRestaurant, "billingSettings"> | null | undefined;

/** True when dine-in guests pay for each order before it goes to the kitchen. */
export function paysUpfront(restaurant: WithBilling): boolean {
  return restaurant?.billingSettings?.dineInPayment === "upfront";
}

/**
 * Orders that go to the kitchen only once they are paid: every kiosk order, and dine-in orders
 * when guests pay when ordering. Paying sends them (kitchen.handlers on order.settled).
 */
export function paidBeforeKitchen(order: Pick<IOrder, "orderType"> & Partial<Pick<IOrder, "source">>, restaurant: WithBilling) {
  return order.source === "kiosk" || (order.orderType === "dine-in" && paysUpfront(restaurant));
}

export async function restaurantPaysUpfront(restaurantId: Types.ObjectId | string): Promise<boolean> {
  return paysUpfront(await Restaurant.findById(restaurantId).select("billingSettings.dineInPayment").lean());
}
