import { IFoodItem } from "../../models/FoodItem";
import { OrderType } from "../../models/Order";

export interface PriceContext {
  orderType: OrderType;
  areaId?: string | null;
}

type PricedFood = Pick<IFoodItem, "price"> & { priceRules?: IFoodItem["priceRules"] | null };

export function basePriceFor(food: PricedFood, ctx: PriceContext): number {
  const rules = food.priceRules;
  if (!rules) return food.price;
  if (ctx.orderType === "takeaway" && rules.takeaway != null) return rules.takeaway;
  if (ctx.orderType === "delivery" && rules.delivery != null) return rules.delivery;
  if (ctx.orderType === "dine-in" && ctx.areaId) {
    const areaPrice = rules.areas?.find((a) => a.areaId.toString() === ctx.areaId);
    if (areaPrice) return areaPrice.price;
  }
  return food.price;
}

export function packagingFor(food: Pick<IFoodItem, "packagingCharge">, orderType: OrderType): number {
  if (orderType !== "takeaway" && orderType !== "delivery") return 0;
  return Math.max(0, food.packagingCharge ?? 0);
}
