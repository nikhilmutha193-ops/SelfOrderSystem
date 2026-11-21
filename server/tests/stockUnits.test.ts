import { beforeAll, describe, expect, it } from "vitest";

import { api, bearer, counterOrder, createWorld, loginAdmin, World } from "./fixtures";

let world: World;
let owner: string;
const stock: Record<string, string> = {};

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
});

const inv = (path: string) => `/api/inventory${path}`;
const find = async (name: string) =>
  (await api().get(inv("/items")).set(bearer(owner))).body.find((i: { name: string }) => i.name === name);

describe("what a stock item is counted in", () => {
  it("accepts weight, volume and count units, and refuses an unknown one", async () => {
    const units = [
      ["Rice", "kg"],
      ["Cooking oil", "l"],
      ["Eggs", "dozen"],
      ["Cheese slices", "packet"],
      ["Straws", "box"],
      ["Soda", "bottle"],
      ["Tomato puree", "can"],
      ["Idli plates", "tray"],
      ["Coriander", "bunch"],
      ["Flour", "g"],
      ["Milk", "ml"],
      ["Cups", "pcs"],
    ];
    for (const [name, unit] of units) {
      const res = await api().post(inv("/items")).set(bearer(owner)).send({ name, unit });
      expect(res.status, `${name} in ${unit}`).toBe(201);
      expect(res.body.unit).toBe(unit);
      stock[name] = res.body._id;
    }
    const bad = await api().post(inv("/items")).set(bearer(owner)).send({ name: "Mystery", unit: "bucket" });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toBe("Choose what the item is counted in");
  });

  it("keeps decimals when counted in kilograms: buy 10 kg, use 0.25 kg a dish", async () => {
    const bought = await api()
      .post(inv("/purchases"))
      .set(bearer(owner))
      .send({ lines: [{ stockItemId: stock.Rice, quantity: 10, unitPrice: 80 }] });
    expect(bought.status).toBe(201);
    expect(await find("Rice")).toMatchObject({ unit: "kg", onHand: 10, avgCost: 80 });

    const recipe = await api()
      .put(inv(`/recipes/${world.food.dosa}`))
      .set(bearer(owner))
      .send({ lines: [{ stockItemId: stock.Rice, quantity: 0.25 }] });
    expect(recipe.status).toBe(200);

    const orderId = await counterOrder(owner, [{ foodItemId: world.food.dosa, quantity: 2 }]);
    await api().post(`/api/orders/${orderId}/kot/print`).set(bearer(owner));
    expect((await find("Rice")).onHand).toBe(9.5);
  });

  it("will not change the unit once the item has stock", async () => {
    const res = await api().put(inv(`/items/${stock.Rice}`)).set(bearer(owner)).send({ name: "Rice", unit: "g" });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/unit can't change/);
  });
});
