import { beforeAll, describe, expect, it } from "vitest";

import OrderItem from "../src/models/OrderItem";
import { api, bearer, counterOrder, createWorld, loginAdmin, seatTable, World } from "./fixtures";

let world: World;
let owner: string;

beforeAll(async () => {
  // Guest items go to the kitchen by themselves in the restaurant flow, so the cafe flow has to stop that.
  world = await createWorld({ guestOrderMode: "auto" });
  owner = await loginAdmin();
});

const setFlow = (serviceFlow: string) => api().put("/api/restaurant/settings").set(bearer(owner)).send({ serviceFlow });

const unsentOrder = (lines = [{ foodItemId: world.food.coffee, quantity: 1 }]) =>
  counterOrder(owner, lines, "Walk-in", { sendToKitchen: false });

const itemsOf = (orderId: string) => OrderItem.find({ orderId }).lean();

describe("service flow setting", () => {
  it("defaults to the restaurant flow, which bills only after the kitchen has the items", async () => {
    const id = await unsentOrder();
    const res = await api().post(`/api/orders/${id}/bill`).set(bearer(owner)).send({});
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Send 1 item to the kitchen/);
  });

  it("only accepts the two known flows", async () => {
    expect((await setFlow("drive-through")).status).toBe(400);
    expect((await setFlow("cafe")).status).toBe(200);
    const pub = await api().get("/api/restaurant/public");
    expect(pub.body.serviceFlow).toBe("cafe");
    const menu = await api().get("/api/pos/menu").set(bearer(owner));
    expect(menu.body.billing.serviceFlow).toBe("cafe");
  });
});

describe("cafe flow: pay first, then the kitchen", () => {
  it("bills an order whose items have not been sent", async () => {
    await setFlow("cafe");
    const id = await unsentOrder();
    const res = await api().post(`/api/orders/${id}/bill`).set(bearer(owner)).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("billed");
    expect((await itemsOf(id)).every((i) => i.kotRound == null)).toBe(true);
  });

  it("sends the KOT, with a token, the moment the order is paid", async () => {
    await setFlow("cafe");
    const id = await unsentOrder([
      { foodItemId: world.food.dosa, quantity: 2 },
      { foodItemId: world.food.vada, quantity: 1 },
    ]);
    const before = await itemsOf(id);
    expect(before.every((i) => i.kotRound == null && i.tokenNumber == null)).toBe(true);

    const paid = await api().patch(`/api/orders/${id}/pay`).set(bearer(owner)).send({ paymentMethod: "upi" });
    expect(paid.status).toBe(200);
    expect(paid.body.status).toBe("closed");

    const after = await itemsOf(id);
    expect(after.every((i) => i.kotRound === 1 && i.tokenNumber != null)).toBe(true);
    expect(new Set(after.map((i) => i.tokenNumber)).size).toBe(1);

    const queue = await api().get("/api/orders/kot/queue").set(bearer(owner));
    expect(queue.body.some((g: { order: { _id: string } }) => g.order._id === id)).toBe(true);
  });

  it("still refuses a hand-made KOT on a closed order", async () => {
    await setFlow("cafe");
    const id = await unsentOrder();
    await api().patch(`/api/orders/${id}/pay`).set(bearer(owner)).send({ paymentMethod: "cash" });
    const res = await api().post(`/api/orders/${id}/kot/print`).set(bearer(owner));
    expect(res.status).toBe(409);
  });

  it("makes the receipt carry the token", async () => {
    await setFlow("cafe");
    const id = await unsentOrder();
    await api().patch(`/api/orders/${id}/pay`).set(bearer(owner)).send({ paymentMethod: "cash" });
    const token = (await itemsOf(id))[0].tokenNumber;
    const share = await api().post(`/api/bills/${id}/share`).set(bearer(owner)).send({});
    const link = share.body.url.split("/bill/")[1];
    const pub = await api().get(`/api/bills/public/${link}`);
    expect(pub.body.order.token).toBe(`Token ${token}`);
  });

  it("keeps guest orders waiting for payment instead of sending them to the kitchen", async () => {
    await setFlow("cafe");
    const seat = await seatTable(1);
    await api()
      .post(`/api/orders/${seat.orderId}/items`)
      .set(bearer(seat.token))
      .send({ items: [{ foodItemId: world.food.dosa, quantity: 1 }] });
    expect((await itemsOf(seat.orderId)).every((i) => i.kotRound == null)).toBe(true);

    await api().patch(`/api/orders/${seat.orderId}/pay`).set(bearer(owner)).send({ paymentMethod: "cash" });
    expect((await itemsOf(seat.orderId)).every((i) => i.kotRound === 1)).toBe(true);
  });
});

describe("tracking an order by its token number", () => {
  it("signs a guest in to just their paid order, read-only", async () => {
    await setFlow("cafe");
    const id = await unsentOrder([{ foodItemId: world.food.dosa, quantity: 1 }]);
    await api().patch(`/api/orders/${id}/pay`).set(bearer(owner)).send({ paymentMethod: "cash" });
    const token = (await itemsOf(id))[0].tokenNumber;

    const login = await api().post("/api/auth/table/token-login").send({ token });
    expect(login.status).toBe(200);
    const mine = await api().get(`/api/orders/${id}`).set(bearer(login.body.token));
    expect(mine.status).toBe(200);
    expect(mine.body.items[0]).toMatchObject({ tokenNumber: token });

    // It cannot see another order, and it cannot order more.
    const other = await unsentOrder();
    expect((await api().get(`/api/orders/${other}`).set(bearer(login.body.token))).status).toBe(403);
    const more = await api()
      .post(`/api/orders/${id}/items`)
      .set(bearer(login.body.token))
      .send({ items: [{ foodItemId: world.food.dosa, quantity: 1 }] });
    expect(more.status).toBe(403);
  });

  it("refuses a token nobody was given, and is only for the cafe flow", async () => {
    await setFlow("cafe");
    expect((await api().post("/api/auth/table/token-login").send({ token: 9876 })).status).toBe(404);
    expect((await api().post("/api/auth/table/token-login").send({ token: "abc" })).status).toBe(400);
    await setFlow("restaurant");
    expect((await api().post("/api/auth/table/token-login").send({ token: 1 })).status).toBe(404);
  });
});

describe("restaurant flow is unchanged", () => {
  it("auto-sends guest items and prints no token on the bill", async () => {
    await setFlow("restaurant");
    const seat = await seatTable(2);
    await api()
      .post(`/api/orders/${seat.orderId}/items`)
      .set(bearer(seat.token))
      .send({ items: [{ foodItemId: world.food.dosa, quantity: 1 }] });
    expect((await itemsOf(seat.orderId)).every((i) => i.kotRound === 1)).toBe(true);

    await api().patch(`/api/orders/${seat.orderId}/pay`).set(bearer(owner)).send({ paymentMethod: "cash" });
    const share = await api().post(`/api/bills/${seat.orderId}/share`).set(bearer(owner)).send({});
    const pub = await api().get(`/api/bills/public/${share.body.url.split("/bill/")[1]}`);
    expect(pub.body.order.token).toBe("");
  });
});
