import { beforeAll, describe, expect, it } from "vitest";

import Booking from "../src/models/Booking";
import FoodReview from "../src/models/FoodReview";
import LandingContent from "../src/models/LandingContent";
import { api, bearer, createWorld, loginAdmin, World } from "./fixtures";

let world: World;
let owner: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
});

function tomorrow(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + 24 * 60 * 60 * 1000));
}

describe("backups", () => {
  it("export and restore keep bookings, dish reviews and landing page content", async () => {
    await api()
      .put("/api/bookings/settings")
      .set(bearer(owner))
      .send({ enabled: true, openTime: "11:00", closeTime: "22:00", slotMinutes: 30 })
      .expect(200);
    const booking = await api()
      .post("/api/bookings")
      .set(bearer(owner))
      .send({ customerName: "Backup Guest", phone: "9876543210", partySize: 2, bookingDate: tomorrow(), slotStart: "13:00" });
    expect(booking.status).toBe(201);

    const restaurantId = world.restaurantId;
    await FoodReview.create({ restaurantId, foodItemId: world.food.coffee, rating: 5 });
    await LandingContent.findOneAndUpdate({ restaurantId }, { $set: { restaurantId } }, { upsert: true });
    const reviewsBefore = await FoodReview.countDocuments({ restaurantId });

    const exported = await api().get("/api/backup/export").set(bearer(owner));
    expect(exported.status).toBe(200);
    const backup = JSON.parse(exported.text);
    expect(backup.bookings).toHaveLength(1);
    expect(backup.foodReviews).toHaveLength(reviewsBefore);
    expect(backup.landingContent).toHaveLength(1);

    await Booking.deleteMany({ restaurantId });
    await FoodReview.deleteMany({ restaurantId });
    await LandingContent.deleteMany({ restaurantId });

    const restored = await api().post("/api/backup/import").set(bearer(owner)).send(backup);
    expect(restored.status).toBe(200);
    expect(restored.body.summary.bookings).toBe(1);

    const back = await Booking.findOne({ restaurantId });
    expect(back?.customerName).toBe("Backup Guest");
    expect(await FoodReview.countDocuments({ restaurantId })).toBe(reviewsBefore);
    expect(await LandingContent.countDocuments({ restaurantId })).toBe(1);
  });
});
