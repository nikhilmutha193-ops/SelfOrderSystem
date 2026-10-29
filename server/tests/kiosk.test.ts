import { beforeAll, describe, expect, it } from "vitest";

import FoodItem from "../src/models/FoodItem";
import Order from "../src/models/Order";
import OrderItem from "../src/models/OrderItem";
import { api, bearer, createWorld, loginAdmin, loginChef, World } from "./fixtures";

let world: World;
let owner: string;
let chef: string;
let kioskToken: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
  chef = await loginChef();
});

const kiosk = (token = kioskToken) => ({ Authorization: `Kiosk ${token}` });

async function pairKiosk(name: string): Promise<string> {
  const created = await api().post("/api/kiosk/devices").set(bearer(owner)).send({ name });
  const paired = await api().post("/api/kiosk/pair").send({ code: created.body.pairingCode });
  return paired.body.token;
}

function placeOrder(body: object, token = kioskToken) {
  return api().post("/api/kiosk/orders").set(kiosk(token)).send(body);
}

const withDosa = (orderType = "takeaway") => ({ orderType, items: [{ foodItemId: world.food.dosa, quantity: 2 }] });

async function board() {
  return (await api().get("/api/pickup")).body as { preparing: number[]; ready: number[] };
}

describe("pairing a kiosk", () => {
  it("pairs with a one-time code and then works with its device token only", async () => {
    const created = await api().post("/api/kiosk/devices").set(bearer(owner)).send({ name: "Front kiosk" });
    expect(created.status).toBe(201);
    expect(created.body.pairingCode).toMatch(/^[A-Z0-9]{8}$/);

    expect((await api().post("/api/kiosk/pair").send({ code: "WRONG234" })).status).toBe(404);
    const paired = await api().post("/api/kiosk/pair").send({ code: created.body.pairingCode.toLowerCase() });
    expect(paired.status).toBe(200);
    kioskToken = paired.body.token;
    // The code works once.
    expect((await api().post("/api/kiosk/pair").send({ code: created.body.pairingCode })).status).toBe(404);

    const config = await api().get("/api/kiosk/config").set(kiosk());
    expect(config.status).toBe(200);
    expect(config.body).toMatchObject({
      device: { name: "Front kiosk" },
      settings: { eatIn: true, takeaway: true, payAtCounter: true, idleSeconds: 60 },
      onlinePayment: false,
    });
    expect((await api().get("/api/kiosk/config")).status).toBe(401);
    expect((await api().get("/api/kiosk/config").set(kiosk("nope"))).status).toBe(401);

    const list = await api().get("/api/kiosk/devices").set(bearer(owner));
    expect(list.body).toEqual([expect.objectContaining({ name: "Front kiosk", paired: true, online: true })]);
  });

  it("keeps device management to staff with the Kiosks page", async () => {
    const manager = await loginAdmin("manager", "Manager@123");
    expect((await api().get("/api/kiosk/devices").set(bearer(manager))).status).toBe(403);
  });
});

describe("ordering at the kiosk", () => {
  it("holds the order with a pickup number until it is paid at the counter", async () => {
    const placed = await placeOrder(withDosa());
    expect(placed.status).toBe(201);
    const { order, totals } = placed.body;
    expect(order).toMatchObject({ source: "kiosk", orderType: "takeaway", status: "open" });
    expect(order.pickupNumber).toEqual(expect.any(Number));
    expect(order.customerName).toBe(`Kiosk #${order.pickupNumber}`);
    expect(totals.grandTotal).toBeGreaterThan(0);

    // Not in the kitchen, not at the till, can't be sent before payment.
    const queue = await api().get("/api/orders/kot/queue").set(bearer(chef));
    expect(JSON.stringify(queue.body)).not.toContain(order._id);
    const floorBefore = await api().get("/api/pos/floor").set(bearer(owner));
    expect(floorBefore.body.takeaways.map((o: { _id: string }) => o._id)).not.toContain(order._id);
    const early = await api().post(`/api/orders/${order._id}/kot/print`).set(bearer(owner));
    expect(early.status).toBe(409);

    const counter = await api().post(`/api/kiosk/orders/${order._id}/pay-at-counter`).set(kiosk());
    expect(counter.status).toBe(200);
    const floor = await api().get("/api/pos/floor").set(bearer(owner));
    expect(floor.body.takeaways).toEqual(
      expect.arrayContaining([expect.objectContaining({ _id: order._id, source: "kiosk", unsent: 1 })])
    );

    // The cashier takes the cash; the KOT goes out with the guest's number.
    const paid = await api().patch(`/api/orders/${order._id}/pay`).set(bearer(owner)).send({ paymentMethod: "cash" });
    expect(paid.status).toBe(200);
    const items = await OrderItem.find({ orderId: order._id });
    expect(items.every((i) => i.tokenNumber === order.pickupNumber)).toBe(true);
    expect((await board()).preparing).toContain(order.pickupNumber);

    await api().patch(`/api/orders/items/${items[0]._id}/preparing`).set(bearer(chef));
    await api().patch(`/api/orders/items/${items[0]._id}/ready`).set(bearer(chef));
    const ready = await board();
    expect(ready.ready).toContain(order.pickupNumber);
    expect(ready.preparing).not.toContain(order.pickupNumber);

    await api().patch(`/api/orders/items/${items[0]._id}/serve`).set(bearer(owner));
    const after = await board();
    expect([...after.preparing, ...after.ready]).not.toContain(order.pickupNumber);
  });

  it("cancels the previous guest's unpaid order when the next one orders", async () => {
    const first = await placeOrder(withDosa("dine-in"));
    const second = await placeOrder(withDosa());
    expect(second.status).toBe(201);
    expect((await Order.findById(first.body.order._id))!.status).toBe("cancelled");
    expect(second.body.order.pickupNumber).toBeGreaterThan(first.body.order.pickupNumber);

    const cancel = await api().post(`/api/kiosk/orders/${second.body.order._id}/cancel`).set(kiosk());
    expect(cancel.body).toEqual({ cancelled: true });
  });

  it("keeps each kiosk to its own orders", async () => {
    const other = await pairKiosk("Side kiosk");
    const mine = await placeOrder(withDosa());
    const peek = await api().get(`/api/kiosk/orders/${mine.body.order._id}`).set(kiosk(other));
    expect(peek.status).toBe(403);
    const staffOrder = await api().post("/api/orders/takeaway").set(bearer(owner)).send({ customerName: "Walk-in" });
    expect((await api().get(`/api/kiosk/orders/${staffOrder.body._id}`).set(kiosk())).status).toBe(403);
  });

  it("refuses sold-out dishes, empty carts and order types the restaurant turned off", async () => {
    await FoodItem.updateOne({ _id: world.food.vada }, { $set: { isActive: false } });
    const soldOut = await placeOrder({ orderType: "takeaway", items: [{ foodItemId: world.food.vada, quantity: 1 }] });
    expect(soldOut.status).toBe(409);
    await FoodItem.updateOne({ _id: world.food.vada }, { $set: { isActive: true } });

    expect((await placeOrder({ orderType: "takeaway", items: [] })).status).toBe(400);

    const settings = await api()
      .put("/api/kiosk/settings")
      .set(bearer(owner))
      .send({ eatIn: false, takeaway: true, payAtCounter: false, idleSeconds: 45 });
    expect(settings.body).toEqual({ eatIn: false, takeaway: true, payAtCounter: false, idleSeconds: 45 });
    expect((await placeOrder(withDosa("dine-in"))).status).toBe(409);

    const order = await placeOrder(withDosa());
    expect((await api().post(`/api/kiosk/orders/${order.body.order._id}/pay-at-counter`).set(kiosk())).status).toBe(409);
    // Online payment isn't set up in this test restaurant.
    const checkout = await api().post(`/api/kiosk/orders/${order.body.order._id}/checkout`).set(kiosk());
    expect(checkout.status).toBe(409);

    const bad = await api().put("/api/kiosk/settings").set(bearer(owner)).send({ eatIn: false, takeaway: false, payAtCounter: true, idleSeconds: 60 });
    expect(bad.status).toBe(400);
    await api().put("/api/kiosk/settings").set(bearer(owner)).send({ eatIn: true, takeaway: true, payAtCounter: true, idleSeconds: 60 });
  });

  it("prices take away from the dish's takeaway price", async () => {
    await FoodItem.updateOne({ _id: world.food.dosa }, { $set: { "priceRules.takeaway": 130 } });
    const find = (menu: { subcategories: { foodItems: { _id: string; price: number }[] }[] }[]) =>
      menu.flatMap((c) => c.subcategories.flatMap((s) => s.foodItems)).find((f) => f._id === world.food.dosa)!;
    expect(find((await api().get("/api/menu")).body).price).toBe(120);
    expect(find((await api().get("/api/menu?orderType=takeaway")).body).price).toBe(130);

    const placed = await placeOrder(withDosa());
    expect(placed.body.items[0].unitPrice).toBe(130);
    await FoodItem.updateOne({ _id: world.food.dosa }, { $unset: { "priceRules.takeaway": "" } });
  });

  it("stops working once the kiosk is removed", async () => {
    const list = await api().get("/api/kiosk/devices").set(bearer(owner));
    const front = list.body.find((d: { name: string }) => d.name === "Front kiosk");
    expect((await api().delete(`/api/kiosk/devices/${front._id}`).set(bearer(owner))).status).toBe(200);
    expect((await api().get("/api/kiosk/config").set(kiosk())).status).toBe(401);
  });
});
