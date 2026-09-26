import { RequestContext } from "../../core/context";
import { HttpError } from "../../utils/httpError";
import { OrdersRepository } from "./orders.repository";

export async function getOwnedOrder(ctx: RequestContext, orderId: string) {
  const order = await new OrdersRepository(ctx.restaurantId).findOrder(orderId);
  if (!order) throw new HttpError(404, "Order not found");
  if (ctx.auth.role === "table" && ctx.auth.orderId !== orderId) {
    throw new HttpError(403, "This order does not belong to your table session");
  }
  return order;
}

export async function requireOwner(ctx: RequestContext, action: string) {
  const admin = ctx.admin ?? (await new OrdersRepository(ctx.restaurantId).findAdmin(ctx.auth.id));
  if (!admin?.isOwner) throw new HttpError(403, `Only the owner account can ${action}`);
  return admin;
}
