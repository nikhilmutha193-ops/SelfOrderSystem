import { afterEach, beforeAll, describe, expect, it } from "vitest";

import Restaurant from "../src/models/Restaurant";
import { api, bearer, counterOrder, createWorld, loginAdmin, World } from "./fixtures";

let world: World;
let owner: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
});

afterEach(async () => {
  await Restaurant.updateOne(
    { _id: world.restaurantId },
    { $set: { "billingSettings.packagingMode": "perPlate", "billingSettings.packagingFlatCharge": 0, "billingSettings.extraCharges": [] } },
  );
});

const detail = async (id: string) => (await api().get(`/api/orders/${id}`).set(bearer(owner))).body;

describe("packaging mode and extra charges", () => {
  it("charges flat packaging once per order, however many plates", async () => {
    await Restaurant.updateOne(
      { _id: world.restaurantId },
      { $set: { "billingSettings.packagingMode": "flat", "billingSettings.packagingFlatCharge": 15 } },
    );
    const id = await counterOrder(owner, [
      { foodItemId: world.food.dosa, quantity: 3 },
      { foodItemId: world.food.vada, quantity: 2 },
    ]);
    const { totals } = await detail(id);
    expect(totals.packagingCharge).toBe(15);
  });

  it("adds named charges automatically for an order type and lets staff remove them", async () => {
    const saved = await api()
      .put("/api/restaurant/settings")
      .set(bearer(owner))
      .send({
        billingSettings: {
          extraCharges: [
            { name: "Parcel box", type: "fixed", value: 10, orderTypes: ["takeaway"], autoApply: true },
            { name: "Cutlery", type: "fixed", value: 5, orderTypes: [], autoApply: false },
            { name: "Handling", type: "percent", value: 10, orderTypes: [], autoApply: false },
          ],
        },
      });
    expect(saved.status).toBe(200);
    const id = await counterOrder(owner, [{ foodItemId: world.food.dosa, quantity: 1 }]);

    let body = await detail(id);
    expect(body.totals.extraCharges).toEqual([{ name: "Parcel box", amount: 10 }]);
    expect(body.extraChargeOptions.map((o: { name: string; applied: boolean }) => [o.name, o.applied])).toEqual([
      ["Parcel box", true],
      ["Cutlery", false],
      ["Handling", false],
    ]);
    const keys = Object.fromEntries(body.extraChargeOptions.map((o: { name: string; key: string }) => [o.name, o.key]));

    for (const name of ["Cutlery", "Handling"]) {
      const res = await api()
        .put(`/api/orders/${id}/extra-charges`)
        .set(bearer(owner))
        .send({ key: keys[name], applied: true });
      expect(res.status).toBe(200);
    }
    body = await detail(id);
    const handling = Math.round(body.totals.subtotal * 10) / 100;
    expect(body.totals.extraCharges).toEqual([
      { name: "Parcel box", amount: 10 },
      { name: "Cutlery", amount: 5 },
      { name: "Handling", amount: handling },
    ]);
    expect(body.totals.taxableAmount).toBeCloseTo(body.totals.subtotal + body.totals.packagingCharge + 15 + handling, 2);

    await api().put(`/api/orders/${id}/extra-charges`).set(bearer(owner)).send({ key: keys["Parcel box"], applied: false });
    body = await detail(id);
    expect(body.totals.extraCharges.map((c: { name: string }) => c.name)).toEqual(["Cutlery", "Handling"]);

    // Billing keeps what was charged, even if the setting changes afterwards.
    await api().post(`/api/orders/${id}/bill`).set(bearer(owner));
    await Restaurant.updateOne({ _id: world.restaurantId }, { $set: { "billingSettings.extraCharges": [] } });
    const billed = await detail(id);
    expect(billed.totals.extraCharges.map((c: { name: string }) => c.name)).toEqual(["Cutlery", "Handling"]);
    const locked = await api()
      .put(`/api/orders/${id}/extra-charges`)
      .set(bearer(owner))
      .send({ key: keys["Cutlery"], applied: false });
    expect(locked.status).toBe(409);
  });

  it("lets staff take packaging off an open order and put it back", async () => {
    await Restaurant.updateOne(
      { _id: world.restaurantId },
      { $set: { "billingSettings.packagingMode": "flat", "billingSettings.packagingFlatCharge": 15 } },
    );
    const id = await counterOrder(owner, [{ foodItemId: world.food.dosa, quantity: 1 }]);
    expect((await detail(id)).totals.packagingCharge).toBe(15);
    const off = await api().put(`/api/orders/${id}/packaging`).set(bearer(owner)).send({ waived: true });
    expect(off.status).toBe(200);
    expect((await detail(id)).totals.packagingCharge).toBe(0);
    await api().put(`/api/orders/${id}/packaging`).set(bearer(owner)).send({ waived: false });
    expect((await detail(id)).totals.packagingCharge).toBe(15);
  });

  it("rejects a badly formed charge", async () => {
    const res = await api()
      .put("/api/restaurant/settings")
      .set(bearer(owner))
      .send({ billingSettings: { extraCharges: [{ name: "", type: "fixed", value: 5 }] } });
    expect(res.status).toBe(400);
  });
});
