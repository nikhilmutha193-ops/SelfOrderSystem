import { Types } from "mongoose";
import KotCounter from "../models/KotCounter";
import { getBusinessDayStart } from "./businessDay";

/**
 * Next kitchen token number for the restaurant's current business day.
 *
 * The counter is keyed by the business day, so the first ticket after the day-end
 * cutoff creates a fresh row and the sequence starts at 1 again - no nightly job to
 * run or reset. Incrementing inside a single upsert keeps two tickets printed at the
 * same moment from claiming the same token.
 */
export async function nextTokenNumber(
  restaurantId: Types.ObjectId | string,
  dayEndTime: string | undefined,
  now = new Date()
): Promise<{ tokenNumber: number; businessDayStart: Date }> {
  const businessDayStart = getBusinessDayStart(now, dayEndTime);

  const counter = await KotCounter.findOneAndUpdate(
    { restaurantId, businessDayStart },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return { tokenNumber: counter.seq, businessDayStart };
}
