import { Types } from "mongoose";

import KotCounter from "../models/KotCounter";
import { getBusinessDayStart } from "./businessDay";

export async function nextTokenNumber(
  restaurantId: Types.ObjectId | string,
  dayEndTime: string | undefined,
  timeZone: string | undefined,
  start = 1,
  now = new Date()
): Promise<{ tokenNumber: number; businessDayStart: Date }> {
  const businessDayStart = getBusinessDayStart(now, dayEndTime, timeZone);

  const counter = await KotCounter.findOneAndUpdate(
    { restaurantId, businessDayStart },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  // The counter always counts from 1; the admin's starting number is added on top.
  return { tokenNumber: counter.seq + Math.max(1, start) - 1, businessDayStart };
}
