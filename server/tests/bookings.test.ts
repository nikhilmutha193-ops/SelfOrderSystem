import { beforeAll, describe, expect, it } from "vitest";

import Booking from "../src/models/Booking";
import TableModel from "../src/models/Table";
import { api, bearer, createWorld, loginAdmin, World } from "./fixtures";

let world: World;
let owner: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
});

function tomorrow(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

async function enableBooking(overrides: Record<string, unknown> = {}) {
  const res = await api()
    .put("/api/bookings/settings")
    .set(bearer(owner))
    .send({ enabled: true, openTime: "11:00", closeTime: "22:00", slotMinutes: 30, ...overrides });
  expect(res.status).toBe(200);
}

describe("table bookings", () => {
  it("rejects a booking with no phone number", async () => {
    await enableBooking();
    const res = await api()
      .post("/api/bookings")
      .set(bearer(owner))
      .send({ customerName: "Asha", partySize: 2, bookingDate: tomorrow(), slotStart: "12:00" });
    expect(res.status).toBe(400);
  });

  it("hides a slot from availability once every table is booked in it", async () => {
    await enableBooking();
    const date = tomorrow();
    for (let i = 0; i < 3; i++) {
      const res = await api()
        .post("/api/bookings")
        .set(bearer(owner))
        .send({ customerName: `Guest ${i}`, phone: "984500000" + i, partySize: 2, bookingDate: date, slotStart: "12:00" });
      expect(res.status).toBe(201);
    }

    const avail = await api().get(`/api/bookings/availability?date=${date}`).set(bearer(owner));
    expect(avail.status).toBe(200);
    const slot = avail.body.find((s: { slotStart: string }) => s.slotStart === "12:00");
    expect(slot).toMatchObject({ available: false, remaining: 0 });

    const fourth = await api()
      .post("/api/bookings")
      .set(bearer(owner))
      .send({ customerName: "One Too Many", phone: "9845000009", partySize: 2, bookingDate: date, slotStart: "12:00" });
    expect(fourth.status).toBe(409);
  });

  it("confirming a booking assigns a table and refuses to double-book that table for the same slot", async () => {
    await enableBooking();
    const date = tomorrow();
    const bookingA = await api()
      .post("/api/bookings")
      .set(bearer(owner))
      .send({ customerName: "Asha", phone: "9845000000", partySize: 2, bookingDate: date, slotStart: "13:00" });
    const bookingB = await api()
      .post("/api/bookings")
      .set(bearer(owner))
      .send({ customerName: "Bala", phone: "9845000001", partySize: 2, bookingDate: date, slotStart: "13:00" });
    expect(bookingA.status).toBe(201);
    expect(bookingB.status).toBe(201);

    const tablesBefore = await api().get(`/api/bookings/${bookingA.body._id}/tables`).set(bearer(owner));
    expect(tablesBefore.status).toBe(200);
    expect(tablesBefore.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tableId: world.tableIds[0], available: true }),
        expect.objectContaining({ tableId: world.tableIds[1], available: true }),
      ])
    );

    const confirmA = await api()
      .post(`/api/bookings/${bookingA.body._id}/confirm`)
      .set(bearer(owner))
      .send({ tableId: world.tableIds[0] });
    expect(confirmA.status).toBe(200);
    expect(confirmA.body.status).toBe("confirmed");

    const tablesForB = await api().get(`/api/bookings/${bookingB.body._id}/tables`).set(bearer(owner));
    expect(tablesForB.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ tableId: world.tableIds[0], available: false })])
    );

    const confirmBSameTable = await api()
      .post(`/api/bookings/${bookingB.body._id}/confirm`)
      .set(bearer(owner))
      .send({ tableId: world.tableIds[0] });
    expect(confirmBSameTable.status).toBe(409);

    const confirmBOtherTable = await api()
      .post(`/api/bookings/${bookingB.body._id}/confirm`)
      .set(bearer(owner))
      .send({ tableId: world.tableIds[1] });
    expect(confirmBOtherTable.status).toBe(200);
  });

  it("blocks table login while a confirmed booking is holding the table, and unblocks once seated", async () => {
    const now = new Date();
    const booking = await Booking.create({
      restaurantId: world.restaurantId,
      customerName: "Asha",
      phone: "919845000000",
      partySize: 2,
      bookingDate: "2020-01-01",
      slotStart: new Date(now.getTime() - 5 * 60 * 1000),
      slotEnd: new Date(now.getTime() + 25 * 60 * 1000),
      status: "confirmed",
      tableId: world.tableIds[0],
    });

    const blocked = await api().post("/api/auth/table/login").send({ code: "tbl1", password: "pass1" });
    expect(blocked.status).toBe(409);

    booking.status = "seated";
    await booking.save();

    const unblocked = await api().post("/api/auth/table/login").send({ code: "tbl1", password: "pass1" });
    expect(unblocked.status).toBe(200);

    // Logging in occupied the table for real - put it back so later tests see a clean floor.
    await TableModel.findByIdAndUpdate(world.tableIds[0], { status: "available", sessionId: null, occupiedAt: null });
  });

  it("lets a guest check availability and create a booking with no login, landing it as pending", async () => {
    await enableBooking();
    const date = tomorrow();

    const settings = await api().get("/api/bookings/public/settings");
    expect(settings.status).toBe(200);
    expect(settings.body.enabled).toBe(true);

    const avail = await api().get(`/api/bookings/public/availability?date=${date}`);
    expect(avail.status).toBe(200);
    expect(avail.body.find((s: { slotStart: string }) => s.slotStart === "15:00")).toMatchObject({ available: true });

    const noPhone = await api()
      .post("/api/bookings/public")
      .send({ customerName: "Guest", partySize: 2, bookingDate: date, slotStart: "15:00" });
    expect(noPhone.status).toBe(400);

    const created = await api()
      .post("/api/bookings/public")
      .send({ customerName: "Walk-up Guest", phone: "9845000099", partySize: 4, bookingDate: date, slotStart: "15:00" });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("pending");

    // Staff can see and act on it exactly like a booking they entered themselves.
    const list = await api().get(`/api/bookings?date=${date}`).set(bearer(owner));
    expect(list.body.bookings.map((b: { _id: string }) => b._id)).toContain(created.body._id);
  });

  it("does not show guest/walk-in tables in the public available-tables list", async () => {
    await TableModel.create({
      restaurantId: world.restaurantId,
      code: "counter",
      passwordHash: "x",
      password: "x",
      status: "available",
      isGuest: true,
    });

    const res = await api().get("/api/tables/available");
    expect(res.status).toBe(200);
    const codes = res.body.map((t: { code: string }) => t.code);
    expect(codes).not.toContain("counter");
    expect(codes).toEqual(expect.arrayContaining(["tbl1", "tbl2", "tbl3"]));
  });
});
