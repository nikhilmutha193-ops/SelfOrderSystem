import { ClientSession, Types } from "mongoose";

import InvoiceCounter from "../models/InvoiceCounter";
import { DEFAULT_TIMEZONE, isValidTimezone } from "./businessDay";

export const INVOICE_PREFIX_PATTERN = /^[A-Z0-9]{1,3}$/;
export const DEFAULT_SAC = "996331";

export function financialYearLabel(date: Date, timeZone: string | undefined): string {
  const zone = timeZone && isValidTimezone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "numeric" }).formatToParts(
    date
  );
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  const startYear = month >= 4 ? year : year - 1;
  const two = (n: number) => String(n % 100).padStart(2, "0");
  return `${two(startYear)}-${two(startYear + 1)}`;
}

export function formatInvoiceNumber(prefix: string, financialYear: string, seq: number): string {
  return `${prefix}/${financialYear}/${String(seq).padStart(6, "0")}`;
}

export async function nextInvoiceNumber(
  restaurantId: Types.ObjectId | string,
  prefix: string,
  financialYear: string,
  session: ClientSession
): Promise<string> {
  const counter = await InvoiceCounter.findOneAndUpdate(
    { restaurantId, financialYear },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true, session }
  );
  return formatInvoiceNumber(prefix, financialYear, counter.seq);
}
