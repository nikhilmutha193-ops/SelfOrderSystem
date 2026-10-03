import { Types } from "mongoose";

import { RequestContext } from "../../core/context";
import { writeAudit } from "../../utils/audit";
import { HttpError } from "../../utils/httpError";
import { clearRecommendationCache } from "../recommendations/recommendations.service";
import { PricingRepository } from "./pricing.repository";
import { AreasInput } from "./pricing.schema";

export async function listAreas(ctx: RequestContext) {
  const restaurant = await new PricingRepository(ctx.restaurantId).findAreas();
  return restaurant?.areas ?? [];
}

export async function saveAreas(ctx: RequestContext, input: AreasInput) {
  const repo = new PricingRepository(ctx.restaurantId);
  const current = (await repo.findAreas())?.areas ?? [];
  const known = new Set(current.map((a) => a._id.toString()));
  if (input.areas.some((a) => a._id && !known.has(a._id))) throw new HttpError(404, "One of these areas no longer exists");

  const next = input.areas.map((a) => ({ _id: a._id ? new Types.ObjectId(a._id) : new Types.ObjectId(), name: a.name }));
  const kept = new Set(next.map((a) => a._id.toString()));
  const removed = current.filter((a) => !kept.has(a._id.toString())).map((a) => a._id);

  const saved = await repo.saveAreas(next);
  if (removed.length) {
    await Promise.all([repo.clearTableAreas(removed), repo.clearFoodAreaPrices(removed)]);
  }
  clearRecommendationCache(ctx.restaurantId);
  await writeAudit(ctx, "pricing.areas.save", `Saved table areas: ${next.map((a) => a.name).join(", ") || "none"}`);
  return saved?.areas ?? [];
}

export async function setTableArea(ctx: RequestContext, tableId: string, areaId: string | null) {
  const repo = new PricingRepository(ctx.restaurantId);
  if (areaId) {
    const areas = (await repo.findAreas())?.areas ?? [];
    if (!areas.some((a) => a._id.toString() === areaId)) throw new HttpError(404, "Area not found");
  }
  const table = await repo.setTableArea(tableId, areaId ? new Types.ObjectId(areaId) : null);
  if (!table) throw new HttpError(404, "Table not found");
  return table;
}
