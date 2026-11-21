import { beforeAll, describe, expect, it } from "vitest";

import BackupRecord from "../src/models/BackupRecord";
import Booking from "../src/models/Booking";
import FoodItem from "../src/models/FoodItem";
import FoodReview from "../src/models/FoodReview";
import LandingContent from "../src/models/LandingContent";
import { runDueBackups } from "../src/utils/backupScheduler";
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

describe("resetting data", () => {
  it("lists collections with their counts", async () => {
    const res = await api().get("/api/backup/collections").set(bearer(owner));
    expect(res.status).toBe(200);
    const foodItems = res.body.find((c: { key: string }) => c.key === "foodItems");
    expect(foodItems.count).toBeGreaterThan(0);
    expect(foodItems.label).toBe("Dishes");
  });

  it("needs the admin password, and a wrong one deletes nothing", async () => {
    const restaurantId = world.restaurantId;
    await FoodReview.create({ restaurantId, foodItemId: world.food.coffee, rating: 3 });
    const none = await api().post("/api/backup/reset").set(bearer(owner)).send({ collections: ["foodReviews"] });
    expect(none.status).toBe(400);
    const wrong = await api()
      .post("/api/backup/reset")
      .set(bearer(owner))
      .send({ collections: ["foodReviews"], password: "not-it" });
    expect(wrong.status).toBe(403);
    expect(await FoodReview.countDocuments({ restaurantId })).toBeGreaterThan(0);
  });

  it("refuses unknown names and half-resets that would leave junk or repeat invoice numbers", async () => {
    const send = (collections: string[]) =>
      api().post("/api/backup/reset").set(bearer(owner)).send({ collections, password: "Owner@123" });
    expect((await send(["nope"])).status).toBe(400);
    expect((await send(["orders"])).status).toBe(400);
    expect((await send(["invoiceCounters"])).status).toBe(400);
    expect((await send([])).status).toBe(400);
  });

  it("empties only the chosen collection and keeps a backup first", async () => {
    const restaurantId = world.restaurantId;
    await FoodReview.create({ restaurantId, foodItemId: world.food.coffee, rating: 4 });
    const dishesBefore = await FoodItem.countDocuments({ restaurantId });

    const res = await api()
      .post("/api/backup/reset")
      .set(bearer(owner))
      .send({ collections: ["foodReviews"], password: "Owner@123" });
    expect(res.status).toBe(200);
    expect(res.body.removed.foodReviews).toBeGreaterThan(0);
    expect(res.body.backupFilename).toMatch(/^backup-/);
    expect(await FoodReview.countDocuments({ restaurantId })).toBe(0);
    expect(await FoodItem.countDocuments({ restaurantId })).toBe(dishesBefore);
  });

  it("can be undone by restoring the backup it saved", async () => {
    const restaurantId = world.restaurantId;
    await FoodReview.create({ restaurantId, foodItemId: world.food.coffee, rating: 5 });
    const before = await FoodReview.countDocuments({ restaurantId });

    const reset = await api()
      .post("/api/backup/reset")
      .set(bearer(owner))
      .send({ collections: ["foodReviews"], password: "Owner@123" });
    expect(reset.status).toBe(200);
    expect(await FoodReview.countDocuments({ restaurantId })).toBe(0);

    const list = await api().get("/api/backup").set(bearer(owner));
    const saved = list.body.find((r: { filename: string }) => r.filename === reset.body.backupFilename);
    expect(saved).toBeTruthy();
    const restored = await api().post(`/api/backup/${saved._id}/restore`).set(bearer(owner));
    expect(restored.status).toBe(200);
    expect(await FoodReview.countDocuments({ restaurantId })).toBe(before);
  });
});

describe("backup times", () => {
  const save = (body: object) => api().put("/api/backup/schedule").set(bearer(owner)).send(body);

  it("keeps several times a day, sorted and without repeats", async () => {
    const res = await save({ enabled: true, times: ["18:30", "09:00", "09:00"] });
    expect(res.status).toBe(200);
    expect(res.body.times).toEqual(["09:00", "18:30"]);
    expect(res.body.time).toBe("09:00");
    expect((await api().get("/api/backup/schedule").set(bearer(owner))).body.times).toEqual(["09:00", "18:30"]);
  });

  it("still accepts the single time older clients send", async () => {
    const res = await save({ enabled: true, time: "04:15" });
    expect(res.status).toBe(200);
    expect(res.body.times).toEqual(["04:15"]);
  });

  it("refuses bad, missing and too many times", async () => {
    expect((await save({ enabled: true, times: ["25:00"] })).status).toBe(400);
    expect((await save({ enabled: true, times: [] })).status).toBe(400);
    expect((await save({ enabled: true, times: ["01:00", "02:00", "03:00", "04:00", "05:00", "06:00", "07:00"] })).status).toBe(400);
  });

  it("runs the scheduler once at each of its times and not in between", async () => {
    await save({ enabled: true, times: ["09:00", "18:30"] });
    const count = () => BackupRecord.countDocuments({ restaurantId: world.restaurantId, trigger: "scheduled" });
    const before = await count();

    await runDueBackups(new Date(2031, 0, 5, 12, 0, 0));
    expect(await count()).toBe(before);

    await runDueBackups(new Date(2031, 0, 5, 9, 0, 5));
    expect(await count()).toBe(before + 1);
    await runDueBackups(new Date(2031, 0, 5, 9, 0, 40)); // a second tick in the same minute
    expect(await count()).toBe(before + 1);

    await runDueBackups(new Date(2031, 0, 5, 18, 30, 5)); // the second time of the same day
    expect(await count()).toBe(before + 2);
  });
});
