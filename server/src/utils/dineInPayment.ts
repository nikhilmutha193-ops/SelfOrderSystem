import { Types } from "mongoose";

import { IOrder } from "../models/Order";
import Restaurant, { IRestaurant } from "../models/Restaurant";

type WithBilling = Pick<IRestaurant, "billingSettings"> & Partial<Pick<IRestaurant, "serviceFlow">>;

/** The cafe service flow: every order is paid first and the kitchen gets it afterwards. */
export function isCafeFlow(restaurant: Partial<Pick<IRestaurant, "serviceFlow">> | null | undefined): boolean {
  return restaurant?.serviceFlow === "cafe";
}

/** True when dine-in guests pay for each order before it goes to the kitchen (cafe flow, or the "upfront" setting). */
export function paysUpfront(restaurant: Partial<WithBilling> | null | undefined): boolean {
  return isCafeFlow(restaurant) || restaurant?.billingSettings?.dineInPayment === "upfront";
}

/**
 * Orders that go to the kitchen only once they are paid: every kiosk order, every order in the cafe flow, and
 * dine-in orders when guests pay when ordering. Paying sends them (kitchen.handlers on order.settled).
 */
export function paidBeforeKitchen(
  order: Pick<IOrder, "orderType"> & Partial<Pick<IOrder, "source">>,
  restaurant: Partial<WithBilling> | null | undefined
) {
  return order.source === "kiosk" || isCafeFlow(restaurant) || (order.orderType === "dine-in" && paysUpfront(restaurant));
}

export async function restaurantPaysUpfront(restaurantId: Types.ObjectId | string): Promise<boolean> {
  return paysUpfront(await Restaurant.findById(restaurantId).select("billingSettings.dineInPayment serviceFlow").lean());
}

export async function restaurantIsCafe(restaurantId: Types.ObjectId | string): Promise<boolean> {
  return isCafeFlow(await Restaurant.findById(restaurantId).select("serviceFlow").lean());
}
