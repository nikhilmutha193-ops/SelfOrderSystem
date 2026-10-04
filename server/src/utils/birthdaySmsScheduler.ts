import { Types } from "mongoose";

import Customer from "../models/Customer";
import Restaurant, { IBirthdaySmsSettings } from "../models/Restaurant";
import { resolveZone } from "./businessDay";
import { describeError, logger } from "./logger";
import { sendSms } from "./sms";

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly is plenty - a birthday is "today" all day

function todayInZone(timeZone: string): { monthDay: string; year: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return { monthDay: `${parts.month}-${parts.day}`, year: Number(parts.year) };
}

function renderTemplate(template: string, vars: { name: string; restaurant: string }): string {
  return template.replace(/\{name\}/g, vars.name).replace(/\{restaurant\}/g, vars.restaurant);
}

/** Texts every customer whose birthday is today (in the restaurant's own timezone) and hasn't
 *  already been greeted this year. Shared by the hourly scheduler and the admin's "Send now"
 *  button - a manual send still respects "once per guest per year" via birthdayGreetedYear. */
export async function sendBirthdayGreetingsForRestaurant(restaurant: {
  _id: Types.ObjectId;
  name: string;
  timezone?: string;
  birthdaySmsSettings: IBirthdaySmsSettings;
}): Promise<number> {
  const { monthDay, year } = todayInZone(resolveZone(restaurant.timezone));
  const customers = await Customer.find({
    restaurantId: restaurant._id,
    birthday: monthDay,
    birthdayGreetedYear: { $ne: year },
  });

  for (const customer of customers) {
    const message = renderTemplate(restaurant.birthdaySmsSettings.template, {
      name: customer.name || "there",
      restaurant: restaurant.name,
    });
    await sendSms(customer.phone, message);
    customer.birthdayGreetedYear = year;
    await customer.save();
  }
  return customers.length;
}

async function sendBirthdayGreetings(): Promise<void> {
  const restaurants = await Restaurant.find({ "birthdaySmsSettings.enabled": true }).select(
    "name timezone birthdaySmsSettings"
  );

  for (const restaurant of restaurants) {
    try {
      const count = await sendBirthdayGreetingsForRestaurant(restaurant);
      if (count > 0) {
        logger.info("birthday-sms-scheduler: sent greetings", { restaurantId: restaurant._id.toString(), count });
      }
    } catch (err) {
      logger.error("birthday-sms-scheduler: failed for restaurant", {
        restaurantId: restaurant._id.toString(),
        ...describeError(err),
      });
    }
  }
}

export function initBirthdaySmsScheduler(): void {
  setInterval(() => {
    sendBirthdayGreetings().catch((err) => logger.error("birthday-sms-scheduler: tick failed", describeError(err)));
  }, CHECK_INTERVAL_MS);
}
