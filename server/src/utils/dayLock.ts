import { Types } from "mongoose";

import { RequestContext } from "../core/context";
import Admin from "../models/Admin";
import DayClose from "../models/DayClose";
import { HttpError } from "./httpError";

export function findClosedDay(restaurantId: Types.ObjectId | string, at: Date) {
  return DayClose.findOne({ restaurantId, businessDayStart: { $lte: at }, businessDayEnd: { $gt: at } });
}

export async function assertDayOpen(ctx: RequestContext, at: Date | null | undefined, action: string): Promise<void> {
  if (!at) return;
  const closed = await findClosedDay(ctx.restaurantId, at);
  if (!closed) return;
  const admin = ctx.admin ?? (ctx.auth.role === "admin" ? await Admin.findById(ctx.auth.id) : null);
  if (admin?.isOwner) return;
  throw new HttpError(409, `The day ${closed.businessDate} is closed. Only the owner can ${action} its bills.`);
}
