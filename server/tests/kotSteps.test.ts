import { afterEach, beforeAll, describe, expect, it } from "vitest";

import OrderItem from "../src/models/OrderItem";
import Restaurant from "../src/models/Restaurant";
import { api, bearer, counterOrder, createWorld, loginAdmin, loginChef, World } from "./fixtures";

let world: World;
let owner: string;
let chef: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
  chef = await loginChef();
});

afterEach(async () => {
  await Restaurant.updateOne({ _id: world.restaurantId }, { $unset: { "kotSettings.steps": "" } });
});

const setSteps = (steps: object) =>
  api().put("/api/restaurant/settings").set(bearer(owner)).send({ kotSettings: { steps } });
const sentItem = async () => {
  const orderId = await counterOrder(owner, [{ foodItemId: world.food.dosa, quantity: 1 }]);
  const [item] = await OrderItem.find({ orderId });
  return item._id.toString();
};
const patch = (itemId: string, action: "preparing" | "ready" | "serve") =>
  api().patch(`/api/orders/items/${itemId}/${action}`).set(bearer(chef));
const statusOf = async (itemId: string) => (await OrderItem.findById(itemId))!.status;

describe("kitchen steps", () => {
  it("follows Waiting, Cooking, Ready, Served by default", async () => {
    const id = await sentItem();
    expect((await patch(id, "ready")).status).toBe(404);
    expect((await patch(id, "preparing")).status).toBe(200);
    expect((await patch(id, "ready")).status).toBe(200);
    expect(await statusOf(id)).toBe("ready");
    expect((await patch(id, "serve")).status).toBe(200);
    expect(await statusOf(id)).toBe("served");
  });

  it("skips Cooking: a sent dish can go straight to Ready", async () => {
    expect((await setSteps({ preparing: false })).status).toBe(200);
    const id = await sentItem();
    expect((await patch(id, "preparing")).status).toBe(409);
    expect((await patch(id, "ready")).status).toBe(200);
    expect(await statusOf(id)).toBe("ready");
  });

  it("skips Ready: Cooking goes straight to Served", async () => {
    expect((await setSteps({ ready: false })).status).toBe(200);
    const id = await sentItem();
    expect((await patch(id, "preparing")).status).toBe(200);
    expect((await patch(id, "ready")).status).toBe(409);
    expect((await patch(id, "serve")).status).toBe(200);
    expect(await statusOf(id)).toBe("served");
  });

  it("skips Served: marking a dish Ready finishes it", async () => {
    expect((await setSteps({ served: false })).status).toBe(200);
    const id = await sentItem();
    await patch(id, "preparing");
    expect((await patch(id, "ready")).status).toBe(200);
    expect(await statusOf(id)).toBe("served");
  });

  it("sends the steps with the kitchen queue and refuses a flow that can't finish", async () => {
    await setSteps({ preparing: false });
    await sentItem();
    const queue = await api().get("/api/orders/kot/queue").set(bearer(chef));
    expect(queue.body[0].steps).toEqual({ preparing: false, ready: true, served: true });
    expect((await setSteps({ ready: false, served: false })).status).toBe(400);
  });
});
