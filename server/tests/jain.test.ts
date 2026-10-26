import { beforeAll, describe, expect, it } from "vitest";

import { api, bearer, createWorld, loginAdmin, World } from "./fixtures";

let world: World;
let owner: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
});

async function newTakeaway() {
  const res = await api().post("/api/orders/takeaway").set(bearer(owner)).send({ customerName: "Jain Guest" });
  expect(res.status).toBe(201);
  return res.body._id as string;
}

const add = (orderId: string, line: object) =>
  api()
    .post(`/api/orders/${orderId}/items`)
    .set(bearer(owner))
    .send({ items: [{ quantity: 1, ...line }] });

describe("Jain orders", () => {
  it("lets any dish be marked Jain by default and keeps the comment", async () => {
    const id = await newTakeaway();
    const res = await add(id, { foodItemId: world.food.dosa, isJain: true, note: "Less spicy · extra crisp" });
    expect(res.status).toBe(201);
    expect(res.body[0]).toMatchObject({ isJain: true, note: "Less spicy · extra crisp" });
  });

  it("refuses Jain for a dish the admin marked as needing onion or garlic", async () => {
    const off = await api().put(`/api/food-items/${world.food.vada}`).set(bearer(owner)).send({ jainAvailable: false });
    expect(off.status).toBe(200);
    expect(off.body.jainAvailable).toBe(false);

    const menu = await api().get("/api/menu");
    const dishes = menu.body.flatMap((c: { subcategories: { foodItems: { _id: string }[] }[] }) =>
      c.subcategories.flatMap((s) => s.foodItems)
    ) as { _id: string; jainAvailable: boolean }[];
    expect(dishes.find((d) => d._id === world.food.vada)?.jainAvailable).toBe(false);
    expect(dishes.find((d) => d._id === world.food.dosa)?.jainAvailable).toBe(true);

    const id = await newTakeaway();
    const refused = await add(id, { foodItemId: world.food.vada, isJain: true });
    expect(refused.status).toBe(400);
    expect(refused.body.message).toBe("Medu Vada can't be made Jain (no onion or garlic)");

    // The same dish is fine as a regular order, and the POS menu tells the till about it.
    expect((await add(id, { foodItemId: world.food.vada })).status).toBe(201);
    const pos = await api().get("/api/pos/menu").set(bearer(owner));
    expect(pos.body.items.find((i: { _id: string }) => i._id === world.food.vada).jainAvailable).toBe(false);
  });

  it("lets the admin turn the spice choice off for a dish", async () => {
    const off = await api()
      .put(`/api/food-items/${world.food.coffee}`)
      .set(bearer(owner))
      .send({ spiceAdjustable: false });
    expect(off.status).toBe(200);
    expect(off.body.spiceAdjustable).toBe(false);

    const menu = await api().get("/api/menu");
    const dishes = menu.body.flatMap((c: { subcategories: { foodItems: { _id: string }[] }[] }) =>
      c.subcategories.flatMap((s) => s.foodItems)
    ) as { _id: string; spiceAdjustable: boolean }[];
    expect(dishes.find((d) => d._id === world.food.coffee)?.spiceAdjustable).toBe(false);
    expect(dishes.find((d) => d._id === world.food.dosa)?.spiceAdjustable).toBe(true);

    const pos = await api().get("/api/pos/menu").set(bearer(owner));
    expect(pos.body.items.find((i: { _id: string }) => i._id === world.food.coffee).spiceAdjustable).toBe(false);
  });
});
