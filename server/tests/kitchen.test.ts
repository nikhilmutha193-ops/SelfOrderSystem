import { beforeAll, describe, expect, it } from "vitest";

import { on } from "../src/core/events";
import { api, bearer, createWorld, loginAdmin, loginChef, seatTable, World } from "./fixtures";

let world: World;
let owner: string;
let chef: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
  chef = await loginChef();
});

async function orderWith(foodItemId: string, quantity = 1) {
  const seat = await seatTable(1);
  await api()
    .post(`/api/orders/${seat.orderId}/items`)
    .set(bearer(seat.token))
    .send({ items: [{ foodItemId, quantity }] });
  return seat;
}

describe("KOT printing", () => {
  it("numbers rounds per order and tokens per business day", async () => {
    const seat = await orderWith(world.food.dosa);
    const kotSent: number[] = [];
    const stop = on("order.kotSent", (event) => void kotSent.push(event.round));

    const first = await api().post(`/api/orders/${seat.orderId}/kot/print`).set(bearer(chef));
    expect(first.body).toMatchObject({ round: 1, tokenNumber: 1 });
    expect(first.body.items).toHaveLength(1);

    const nothing = await api().post(`/api/orders/${seat.orderId}/kot/print`).set(bearer(chef));
    expect(nothing.body).toEqual({ round: null, items: [], message: "No new items to send to the kitchen" });

    await api()
      .post(`/api/orders/${seat.orderId}/items`)
      .set(bearer(seat.token))
      .send({ items: [{ foodItemId: world.food.coffee, quantity: 1 }] });
    const second = await api().post(`/api/orders/${seat.orderId}/kot/print`).set(bearer(owner));
    expect(second.body).toMatchObject({ round: 2, tokenNumber: 2 });

    stop();
    expect(kotSent).toEqual([1, 2]);

    await api().patch(`/api/orders/${seat.orderId}/cancel`).set(bearer(owner));
  });

  it("serves the ticket as a PDF and validates the round", async () => {
    const seat = await orderWith(world.food.vada);
    await api().post(`/api/orders/${seat.orderId}/kot/print`).set(bearer(chef));

    const pdf = await api().get(`/api/orders/${seat.orderId}/kot/1/pdf`).set(bearer(chef));
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");

    expect((await api().get(`/api/orders/${seat.orderId}/kot/9/pdf`).set(bearer(chef))).status).toBe(404);
    expect((await api().get(`/api/orders/${seat.orderId}/kot/abc/pdf`).set(bearer(chef))).status).toBe(400);

    await api().patch(`/api/orders/${seat.orderId}/cancel`).set(bearer(owner));
  });
});

describe("item status", () => {
  it("moves an item through preparing, ready and served in order", async () => {
    const seat = await orderWith(world.food.dosa);
    const early = await api()
      .get(`/api/orders/${seat.orderId}`)
      .set(bearer(owner))
      .then((res) => res.body.items[0]._id);
    expect((await api().patch(`/api/orders/items/${early}/preparing`).set(bearer(chef))).status).toBe(404);

    const kot = await api().post(`/api/orders/${seat.orderId}/kot/print`).set(bearer(chef));
    const itemId = kot.body.items[0]._id;

    expect((await api().patch(`/api/orders/items/${itemId}/ready`).set(bearer(chef))).status).toBe(404);
    expect((await api().patch(`/api/orders/items/${itemId}/preparing`).set(bearer(chef))).body.status).toBe(
      "preparing"
    );
    const ready = await api().patch(`/api/orders/items/${itemId}/ready`).set(bearer(chef));
    expect(ready.body.status).toBe("ready");
    expect(ready.body.readyAt).toBeTruthy();
    expect((await api().patch(`/api/orders/items/${itemId}/serve`).set(bearer(chef))).body.status).toBe("served");
    expect((await api().patch(`/api/orders/items/${itemId}/serve`).set(bearer(chef))).status).toBe(404);
    expect((await api().patch(`/api/orders/items/zzz/serve`).set(bearer(chef))).status).toBe(400);

    await api().patch(`/api/orders/${seat.orderId}/pay`).set(bearer(owner)).send({ paymentMethod: "cash" });
  });

  it("lists open work in token order and filters by table", async () => {
    const a = await orderWith(world.food.vada);
    await api().post(`/api/orders/${a.orderId}/kot/print`).set(bearer(chef));

    const queue = await api().get("/api/orders/kot/queue").set(bearer(chef));
    expect(queue.status).toBe(200);
    const tokens = queue.body.map((group: { tokenNumber: number | null }) => group.tokenNumber);
    expect(tokens).toEqual([...tokens].sort((x, y) => (x ?? Infinity) - (y ?? Infinity)));

    const filtered = await api().get("/api/orders/kot/queue").set(bearer(chef)).query({ tableId: world.tableIds[0] });
    expect(
      filtered.body.every((g: { order: { tableId: { _id: string } } }) => g.order.tableId._id === world.tableIds[0])
    ).toBe(true);
    expect((await api().get("/api/orders/kot/queue").set(bearer(chef)).query({ tableId: "x" })).status).toBe(400);
  });
});
