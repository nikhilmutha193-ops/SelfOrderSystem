import { NextFunction, Request, Response } from "express";

import Restaurant from "../models/Restaurant";
import { HttpError } from "../utils/httpError";

let cachedRestaurantId: string | null = null;

export async function resolveTenant(req: Request, res: Response, next: NextFunction) {
  try {
    if (!cachedRestaurantId) {
      const key = process.env.RESTAURANT_KEY;
      if (!key) throw new HttpError(500, "RESTAURANT_KEY is not configured on the server");
      const restaurant = await Restaurant.findOne({ key: key.toLowerCase() });
      if (!restaurant) {
        throw new HttpError(500, `No restaurant found for key "${key}". Run "npm run seed" first.`);
      }
      cachedRestaurantId = restaurant._id.toString();
    }
    req.restaurantId = cachedRestaurantId;
    next();
  } catch (err) {
    next(err);
  }
}

export function clearTenantCache() {
  cachedRestaurantId = null;
}
