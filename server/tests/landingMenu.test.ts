import { beforeAll, describe, expect, it } from "vitest";

import FoodItem from "../src/models/FoodItem";
import { api, bearer, createWorld, loginAdmin, World } from "./fixtures";

let world: World;
let owner: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
});

const onPage = async () => ((await api().get("/api/landing")).body.bestsellers as { _id: string }[]).map((d) => d._id);
const list = async () => (await api().get("/api/restaurant/landing-menu").set(bearer(owner))).body as { _id: string; shown: boolean }[];

describe("choosing the dishes of the landing page menu", () => {
  it("lists every active dish, and until a choice is made a dish follows Bestseller as before", async () => {
    await FoodItem.updateOne({ _id: world.food.dosa }, { $set: { isBestseller: true } });
    await FoodItem.updateOne({ _id: world.food.vada }, { $set: { isBestseller: false } });
    const dishes = await list();
    expect(dishes.length).toBeGreaterThan(1);
    expect(dishes.find((d) => d._id === world.food.dosa)!.shown).toBe(true);
    expect(dishes.find((d) => d._id === world.food.vada)!.shown).toBe(false);
    expect(await onPage()).toContain(world.food.dosa);
    expect(await onPage()).not.toContain(world.food.vada);
  });

  it("shows a dish that is not a bestseller, and hides one that is", async () => {
    const show = await api().put(`/api/restaurant/landing-menu/${world.food.vada}`).set(bearer(owner)).send({ show: true });
    expect(show.status).toBe(200);
    const hide = await api().put(`/api/restaurant/landing-menu/${world.food.dosa}`).set(bearer(owner)).send({ show: false });
    expect(hide.status).toBe(200);
    expect(await onPage()).toContain(world.food.vada);
    expect(await onPage()).not.toContain(world.food.dosa);
    // Hiding it on the landing page leaves its Bestseller mark alone.
    expect((await FoodItem.findById(world.food.dosa))!.isBestseller).toBe(true);
  });

  it("needs a yes or no, a dish of this restaurant, and a login", async () => {
    expect((await api().put(`/api/restaurant/landing-menu/${world.food.dosa}`).set(bearer(owner)).send({ show: "yes" })).status).toBe(400);
    expect((await api().put("/api/restaurant/landing-menu/64b000000000000000000000").set(bearer(owner)).send({ show: true })).status).toBe(404);
    expect((await api().put(`/api/restaurant/landing-menu/${world.food.dosa}`).send({ show: true })).status).toBe(401);
    expect((await api().get("/api/restaurant/landing-menu")).status).toBe(401);
  });
});

describe("the buttons under the landing page menu", () => {
  it("can each be switched off, and both are on by default", async () => {
    const start = await api().get("/api/restaurant/landing-content").set(bearer(owner));
    expect(start.body.menu).toMatchObject({ showCta: true, showCardButton: true });
    const saved = await api()
      .put("/api/restaurant/landing-content")
      .set(bearer(owner))
      .send({ menu: { ...start.body.menu, showCta: false, showCardButton: false } });
    expect(saved.body.menu).toMatchObject({ showCta: false, showCardButton: false, ctaLabel: "See the full menu" });
    expect((await api().get("/api/landing")).body.content.menu).toMatchObject({ showCta: false, showCardButton: false });
  });
});

