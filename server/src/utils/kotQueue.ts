import { Types } from "mongoose";

import KotCounter from "../models/KotCounter";
import { getBusinessDayStart } from "./businessDay";

export async function nextTokenNumber(
  restaurantId: Types.ObjectId | string,
  dayEndTime: string | undefined,
  timeZone: string | undefined,
  now = new Date()
): Promise<{ tokenNumber: number; businessDayStart: Date }> {
  const businessDayStart = getBusinessDayStart(now, dayEndTime, timeZone);

  const counter = await KotCounter.findOneAndUpdate(
    { restaurantId, businessDayStart },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return { tokenNumber: counter.seq, businessDayStart };
}
