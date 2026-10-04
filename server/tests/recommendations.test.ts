import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { clearRecommendationCache, pairCounts } from "../src/modules/recommendations/recommendations.service";
import { api, bearer, counterOrder, createWorld, loginAdmin, World } from "./fixtures";

let world: World;
let owner: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
});

beforeEach(() => clearRecommendationCache());

describe("pairCounts", () => {
  it("counts how often two dishes share an order, in both directions", () => {
    const counts = pairCounts([
      ["a", "b"],
      ["a", "b", "c"],
      ["a", "a", "c"],
    ]);
    expect(counts.get("a")?.get("b")).toBe(2);
    expect(counts.get("b")?.get("a")).toBe(2);
    expect(counts.get("a")?.get("c")).toBe(2);
    expect(counts.get("a")?.has("a")).toBe(false);
  });
});

describe("GET /api/menu/recommendations", () => {
  it("returns popular dishes and dishes ordered together, without login", async () => {
    await counterOrder(owner, [
      { foodItemId: world.food.coffee, quantity: 3 },
      { foodItemId: world.food.dosa, quantity: 1 },
    ]);
    await counterOrder(owner, [
      { foodItemId: world.food.coffee, quantity: 2 },
      { foodItemId: world.food.dosa, quantity: 1 },
    ]);
    await counterOrder(owner, [
      { foodItemId: world.food.coffee, quantity: 1 },
      { foodItemId: world.food.vada, quantity: 1 },
    ]);

    const res = await api().get("/api/menu/recommendations");
    expect(res.status).toBe(200);
    expect(res.body.popular[0]).toBe(world.food.coffee);
    expect(res.body.popular).not.toContain(world.food.hidden);
    expect(res.body.pairs[world.food.coffee]).toEqual([world.food.dosa, world.food.vada]);
    expect(res.body.pairs[world.food.vada]).toEqual([world.food.coffee]);
  });

  it("puts the owner's chosen pairings first and never suggests hidden dishes", async () => {
    const saved = await api()
      .put(`/api/food-items/${world.food.vada}`)
      .set(bearer(owner))
      .send({ pairsWith: [world.food.dosa, world.food.hidden, world.food.vada] });
    expect(saved.status).toBe(200);
    expect(saved.body.pairsWith).toEqual([world.food.dosa, world.food.hidden]);

    const res = await api().get("/api/menu/recommendations");
    expect(res.body.pairs[world.food.vada]).toEqual([world.food.dosa, world.food.coffee]);
  });

  it("rejects more than four pairings or unknown dishes", async () => {
    const tooMany = await api()
      .put(`/api/food-items/${world.food.coffee}`)
      .set(bearer(owner))
      .send({ pairsWith: [world.food.dosa, world.food.vada, world.food.hidden, "64b000000000000000000001", "64b000000000000000000002"] });
    expect(tooMany.status).toBe(400);

    const unknown = await api()
      .put(`/api/food-items/${world.food.coffee}`)
      .set(bearer(owner))
      .send({ pairsWith: ["64b000000000000000000001"] });
    expect(unknown.status).toBe(404);
  });
});
