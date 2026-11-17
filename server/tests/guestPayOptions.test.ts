import { afterEach, beforeAll, describe, expect, it } from "vitest";

import Restaurant from "../src/models/Restaurant";
import { api, bearer, createWorld, loginAdmin, seatTable, World } from "./fixtures";

let world: World;
let owner: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
  await Restaurant.updateOne({ _id: world.restaurantId }, { $set: { "billingSettings.upiVpa": "cafe@okicici" } });
});

afterEach(async () => {
  await Restaurant.updateOne({ _id: world.restaurantId }, { $unset: { "billingSettings.guestPayOptions": "" } });
});

describe("guest payment options", () => {
  it("shows every way to pay by default", async () => {
    const seat = await seatTable(1);
    const res = await api().get(`/api/orders/${seat.orderId}`).set(bearer(seat.token));
    expect(res.status).toBe(200);
    expect(res.body.payment.upiVpa).toBe("cafe@okicici");
    expect(res.body.payOptions).toEqual({ counter: true });
  });

  it("hides what the owner turned off from guests but not from staff", async () => {
    const saved = await api()
      .put("/api/restaurant/settings")
      .set(bearer(owner))
      .send({ billingSettings: { guestPayOptions: { online: false, upiQr: false, counter: false } } });
    expect(saved.status).toBe(200);

    const seat = await seatTable(2);
    const guest = await api().get(`/api/orders/${seat.orderId}`).set(bearer(seat.token));
    expect(guest.body.payment.upiVpa).toBe("");
    expect(guest.body.payOptions).toEqual({ counter: false });
    expect(guest.body.onlinePayment).toBe(false);

    const staff = await api().get(`/api/orders/${seat.orderId}`).set(bearer(owner));
    expect(staff.body.payment.upiVpa).toBe("cafe@okicici");
    expect(staff.body.payOptions).toEqual({ counter: true });
  });

  it("rejects a badly formed option", async () => {
    const res = await api()
      .put("/api/restaurant/settings")
      .set(bearer(owner))
      .send({ billingSettings: { guestPayOptions: { online: "no" } } });
    expect(res.status).toBe(400);
  });
});
