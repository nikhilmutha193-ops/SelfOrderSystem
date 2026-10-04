import { beforeAll, describe, expect, it } from "vitest";

import StockItem from "../src/models/StockItem";
import { classify } from "../src/modules/menuEngineering/menuEngineering.service";
import { api, bearer, counterOrder, createWorld, loginAdmin, World } from "./fixtures";

let world: World;
let owner: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
});

function dish(name: string, quantity: number, margin: number | null) {
  return {
    foodItemId: name,
    name,
    category: "",
    isActive: true,
    quantity,
    revenue: 0,
    avgPrice: 100,
    cost: margin == null ? null : 100 - margin,
    margin,
    marginPercent: margin,
    totalMargin: margin == null ? null : margin * quantity,
  };
}

describe("menu engineering classification", () => {
  it("puts each dish in the right quadrant against popularity and weighted margin", () => {
    const { dishes, thresholds } = classify([
      dish("star", 40, 70),
      dish("workhorse", 40, 20),
      dish("puzzle", 5, 80),
      dish("dog", 5, 10),
      dish("no recipe", 10, null),
    ]);
    const byName = Object.fromEntries(dishes.map((d) => [d.name, d.class]));
    expect(byName).toEqual({ star: "star", workhorse: "workhorse", puzzle: "puzzle", dog: "dog", "no recipe": "unknown" });
    expect(thresholds.popularityMixPercent).toBe(14);
    expect(thresholds.avgMargin).toBe(45);
  });

  it("returns empty thresholds when nothing has a recipe or sales", () => {
    const { dishes, thresholds } = classify([dish("a", 0, null)]);
    expect(dishes[0].class).toBe("unknown");
    expect(thresholds.avgMargin).toBeNull();
  });
});

describe("GET /api/analytics/menu-engineering", () => {
  it("classifies dishes from paid orders using recipe cost", async () => {
    const item = await api()
      .post("/api/inventory/items")
      .set(bearer(owner))
      .send({ name: "Ingredient", unit: "g", purchaseUnit: "kg", purchaseFactor: 1000 });
    expect(item.status).toBe(201);
    await StockItem.updateOne({ _id: item.body._id }, { $set: { avgCost: 1 } });
    for (const [food, qty] of [
      [world.food.coffee, 20],
      [world.food.dosa, 90],
      [world.food.vada, 10],
    ] as const) {
      const res = await api()
        .put(`/api/inventory/recipes/${food}`)
        .set(bearer(owner))
        .send({ lines: [{ stockItemId: item.body._id, quantity: qty }] });
      expect(res.status).toBe(200);
    }

    const orderId = await counterOrder(owner, [
      { foodItemId: world.food.coffee, quantity: 10 },
      { foodItemId: world.food.dosa, quantity: 8 },
      { foodItemId: world.food.vada, quantity: 2 },
    ]);
    const paid = await api().patch(`/api/orders/${orderId}/pay`).set(bearer(owner)).send({ paymentMethod: "cash" });
    expect(paid.status).toBe(200);
    await counterOrder(owner, [{ foodItemId: world.food.vada, quantity: 30 }], "Unpaid");

    const res = await api().get("/api/analytics/menu-engineering?days=7").set(bearer(owner));
    expect(res.status).toBe(200);
    const byName = Object.fromEntries(
      res.body.dishes.map((d: { name: string; class: string; quantity: number; margin: number }) => [d.name, d])
    );
    expect(byName["Filter Coffee"]).toMatchObject({ class: "star", quantity: 10, margin: 80 });
    expect(byName["Masala Dosa"]).toMatchObject({ class: "workhorse", quantity: 8, margin: 30 });
    expect(byName["Medu Vada"]).toMatchObject({ class: "dog", quantity: 2, margin: 50 });
    expect(res.body.thresholds.avgMargin).toBe(57);
    expect(res.body.totals.quantity).toBe(20);
    expect(byName["Seasonal Special"]).toBeUndefined();
  });

  it("rejects an out-of-range period", async () => {
    const res = await api().get("/api/analytics/menu-engineering?days=0").set(bearer(owner));
    expect(res.status).toBe(400);
  });
});
