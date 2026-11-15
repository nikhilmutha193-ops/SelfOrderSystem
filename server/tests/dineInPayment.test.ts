import { beforeAll, describe, expect, it } from "vitest";

import Order from "../src/models/Order";
import OrderItem from "../src/models/OrderItem";
import Restaurant from "../src/models/Restaurant";
import TableModel from "../src/models/Table";
import { releaseServedPayFirstTables } from "../src/utils/tableReleaseScheduler";
import { api, bearer, counterOrder, createWorld, loginAdmin, loginChef, seatTable, World } from "./fixtures";

let world: World;
let owner: string;
let chef: string;

beforeAll(async () => {
  // "auto" so these tests show that paying first overrides automatic sending.
  world = await createWorld({ guestOrderMode: "auto" });
  owner = await loginAdmin();
  chef = await loginChef();
});

const setDineInPayment = (dineInPayment: "after" | "upfront") =>
  Restaurant.updateOne({ _id: world.restaurantId }, { $set: { "billingSettings.dineInPayment": dineInPayment } });

async function queueOrderIds(): Promise<string[]> {
  const res = await api().get("/api/orders/kot/queue").set(bearer(chef));
  return res.body.map((group: { order: { _id: string } }) => group.order._id);
}

const tableStatus = async (n: number) => (await TableModel.findById(world.tableIds[n]))!.status;
const pay = (orderId: string) =>
  api().patch(`/api/orders/${orderId}/pay`).set(bearer(owner)).send({ paymentMethod: "cash" });

describe("kitchen queue after payment", () => {
  it("keeps a takeaway paid before cooking until it is served", async () => {
    await setDineInPayment("after");
    const orderId = await counterOrder(owner, [{ foodItemId: world.food.dosa, quantity: 1 }]);
    expect((await pay(orderId)).status).toBe(200);
    expect(await queueOrderIds()).toContain(orderId);

    const [item] = await OrderItem.find({ orderId });
    await api().patch(`/api/orders/items/${item._id}/preparing`).set(bearer(chef));
    await api().patch(`/api/orders/items/${item._id}/ready`).set(bearer(chef));
    expect(await queueOrderIds()).toContain(orderId);
    await api().patch(`/api/orders/items/${item._id}/serve`).set(bearer(owner));
    expect(await queueOrderIds()).not.toContain(orderId);
  });

  it("hands over ready dishes when the bill is settled", async () => {
    const orderId = await counterOrder(owner, [{ foodItemId: world.food.vada, quantity: 1 }]);
    const [item] = await OrderItem.find({ orderId });
    await api().patch(`/api/orders/items/${item._id}/preparing`).set(bearer(chef));
    await api().patch(`/api/orders/items/${item._id}/ready`).set(bearer(chef));

    await pay(orderId);
    expect((await OrderItem.findById(item._id))!.status).toBe("served");
    expect(await queueOrderIds()).not.toContain(orderId);
  });
});

describe("paying after eating (default)", () => {
  it("still refuses to bill items that never went to the kitchen", async () => {
    await setDineInPayment("after");
    const orderId = await counterOrder(owner, [{ foodItemId: world.food.dosa, quantity: 1 }], "Guest", {
      sendToKitchen: false,
      tableId: world.tableIds[2],
    });
    const bill = await api().post(`/api/orders/${orderId}/bill`).set(bearer(owner)).send({});
    expect(bill.status).toBe(409);
    await api().patch(`/api/orders/${orderId}/cancel`).set(bearer(owner)).send({});
    await api().patch(`/api/tables/${world.tableIds[2]}/release`).set(bearer(owner));
  });
});

describe("paying when ordering", () => {
  it("holds a guest's QR order until it is paid, then sends it and keeps the table seated", async () => {
    await setDineInPayment("upfront");
    const seat = await seatTable(1);
    const added = await api()
      .post(`/api/orders/${seat.orderId}/items`)
      .set(bearer(seat.token))
      .send({ items: [{ foodItemId: world.food.dosa, quantity: 2 }] });
    expect(added.status).toBe(201);

    // Not sent, even though guest orders are set to go to the kitchen automatically.
    expect((await OrderItem.find({ orderId: seat.orderId })).every((i) => i.kotRound == null)).toBe(true);
    expect(await queueOrderIds()).not.toContain(seat.orderId);
    const guestView = await api().get(`/api/orders/${seat.orderId}`).set(bearer(seat.token));
    expect(guestView.body.dineInPayment).toBe("upfront");
    // Nobody can send it to the kitchen before it is paid.
    const early = await api().post(`/api/orders/${seat.orderId}/kot/print`).set(bearer(owner));
    expect(early.status).toBe(409);
    expect(early.body.message).toBe("Guests pay when ordering here. Take the payment and the order goes to the kitchen.");

    expect((await pay(seat.orderId)).status).toBe(200);
    const items = await OrderItem.find({ orderId: seat.orderId });
    expect(items.every((i) => i.kotRound === 1 && typeof i.tokenNumber === "number")).toBe(true);
    expect(await queueOrderIds()).toContain(seat.orderId);
    expect(await tableStatus(0)).toBe("occupied");

    // The guest is still signed in and their next round is a new order.
    const again = await api()
      .post("/api/orders/dine-in")
      .set(bearer(seat.token))
      .send({ customerName: "Asha", members: 2 });
    expect(again.status).toBe(201);
    expect(again.body.order._id).not.toBe(seat.orderId);
  });

  it("lets the till take a new paid round on a seated table, but not a second unpaid one", async () => {
    await setDineInPayment("upfront");
    const tableId = world.tableIds[1];
    const create = (key: string) =>
      api()
        .post("/api/pos/orders")
        .set({ ...bearer(owner), "Idempotency-Key": key })
        .send({ orderType: "dine-in", tableId, members: 2, sendToKitchen: true, items: [{ foodItemId: world.food.vada, quantity: 1 }] });

    const first = await create("upfront-first");
    expect(first.status).toBe(201);
    expect(first.body.kot).toBeNull();
    expect((await create("upfront-while-unpaid")).status).toBe(409);

    expect((await pay(first.body.order._id)).status).toBe(200);
    expect(await tableStatus(1)).toBe("occupied");

    const second = await create("upfront-second");
    expect(second.status).toBe(201);
    expect(await tableStatus(1)).toBe("occupied");
    await pay(second.body.order._id);

    const released = await api().patch(`/api/pos/tables/${tableId}/release`).set(bearer(owner));
    expect(released.status).toBe(200);
    expect(released.body.status).toBe("available");
    expect(await tableStatus(1)).toBe("available");
  });

  it("can print the bill before payment without sending anything to the kitchen", async () => {
    const orderId = await counterOrder(owner, [{ foodItemId: world.food.coffee, quantity: 1 }], "Guest", {
      sendToKitchen: false,
      tableId: world.tableIds[2],
    });
    const bill = await api().post(`/api/orders/${orderId}/bill`).set(bearer(owner)).send({});
    expect(bill.status).toBe(200);
    expect((await OrderItem.find({ orderId })).every((i) => i.kotRound == null)).toBe(true);

    await pay(orderId);
    expect((await OrderItem.find({ orderId })).every((i) => i.kotRound != null)).toBe(true);
  });

  it("frees the table when staff release it, ending the guest's session", async () => {
    await setDineInPayment("upfront");
    const released = await api().patch(`/api/pos/tables/${world.tableIds[0]}/release`).set(bearer(owner));
    expect(released.status).toBe(200);
    expect(await tableStatus(0)).toBe("available");
  });

  it("keeps the release endpoint to staff with Orders access", async () => {
    const chefTry = await api().patch(`/api/pos/tables/${world.tableIds[2]}/release`).set(bearer(chef));
    expect(chefTry.status).toBe(403);
  });
});

describe("ordering again after paying", () => {
  it("lets a guest start a second order on the same table session and see both with their tokens", async () => {
    await setDineInPayment("upfront");
    const first = await seatTable(3);
    await api()
      .post(`/api/orders/${first.orderId}/items`)
      .set(bearer(first.token))
      .send({ items: [{ foodItemId: world.food.dosa, quantity: 1 }] });
    expect((await pay(first.orderId)).status).toBe(200);

    // Same sign-in: a new order starts for the next round.
    const next = await api()
      .post("/api/orders/dine-in")
      .set(bearer(first.token))
      .send({ customerName: "Asha", members: 2 });
    expect(next.status).toBe(201);
    expect(next.body.order._id).not.toBe(first.orderId);
    const token2 = next.body.token as string;
    await api()
      .post(`/api/orders/${next.body.order._id}/items`)
      .set(bearer(token2))
      .send({ items: [{ foodItemId: world.food.vada, quantity: 1 }] });
    await pay(next.body.order._id);

    const mine = await api().get("/api/orders/session/mine").set(bearer(token2));
    expect(mine.status).toBe(200);
    expect(mine.body.map((o: { orderId: string }) => o.orderId)).toEqual([first.orderId, next.body.order._id]);
    expect(mine.body.map((o: { current: boolean }) => o.current)).toEqual([false, true]);
    const tokens = mine.body.map((o: { tokens: number[] }) => o.tokens[0]);
    expect(tokens[0]).toBeDefined();
    expect(tokens[1]).toBeGreaterThan(tokens[0]);

    // The earlier order can still be opened from the new session token, but not by another table.
    expect((await api().get(`/api/orders/${first.orderId}`).set(bearer(token2))).status).toBe(200);
    const other = await seatTable(2);
    expect((await api().get(`/api/orders/${first.orderId}`).set(bearer(other.token))).status).toBe(403);
    await setDineInPayment("after");
  });
});

describe("releasing a paid and served table", () => {
  it("frees the table two minutes after every dish is paid for and served, not before", async () => {
    await setDineInPayment("upfront");
    const seat = await seatTable(2);
    await api()
      .post(`/api/orders/${seat.orderId}/items`)
      .set(bearer(seat.token))
      .send({ items: [{ foodItemId: world.food.dosa, quantity: 1 }] });
    expect((await pay(seat.orderId)).status).toBe(200);

    // Paid but not served yet: the table stays.
    const old = new Date(Date.now() - 10 * 60 * 1000);
    const backdate = async () => {
      await OrderItem.collection.updateMany({}, { $set: { updatedAt: old } });
      await Order.collection.updateMany({}, { $set: { updatedAt: old } });
    };
    await backdate();
    await releaseServedPayFirstTables();
    expect(await tableStatus(1)).toBe("occupied");

    // Served just now: still inside the two minutes.
    const [item] = await OrderItem.find({ orderId: seat.orderId });
    await api().patch(`/api/orders/items/${item._id}/serve`).set(bearer(owner));
    await releaseServedPayFirstTables();
    expect(await tableStatus(1)).toBe("occupied");

    // Served more than two minutes ago: released.
    await backdate();
    await releaseServedPayFirstTables();
    expect(await tableStatus(1)).toBe("available");
    await setDineInPayment("after");
  });
});

describe("takeaway and counter pay first", () => {
  const takeaway = (key: string) =>
    api()
      .post("/api/pos/orders")
      .set({ ...bearer(owner), "Idempotency-Key": key })
      .send({ orderType: "takeaway", sendToKitchen: true, items: [{ foodItemId: world.food.dosa, quantity: 1 }] });

  it("holds a takeaway until it is paid when the switch is on, and keeps dine-in paying after", async () => {
    await setDineInPayment("after");
    await Restaurant.updateOne({ _id: world.restaurantId }, { $set: { "billingSettings.takeawayPayFirst": true } });

    const held = await takeaway("takeaway-pay-first");
    expect(held.status).toBe(201);
    expect(held.body.kot).toBeNull();
    expect(await queueOrderIds()).not.toContain(held.body.order._id);
    expect((await pay(held.body.order._id)).status).toBe(200);
    expect(await queueOrderIds()).toContain(held.body.order._id);

    // Earlier tests may have left this table seated.
    await api().patch(`/api/pos/tables/${world.tableIds[2]}/release`).set(bearer(owner));
    const dineIn = await api()
      .post("/api/pos/orders")
      .set({ ...bearer(owner), "Idempotency-Key": "dine-in-still-after" })
      .send({ orderType: "dine-in", tableId: world.tableIds[2], members: 2, sendToKitchen: true, items: [{ foodItemId: world.food.vada, quantity: 1 }] });
    expect(dineIn.status).toBe(201);
    expect(dineIn.body.kot).not.toBeNull();
    await api().patch(`/api/pos/tables/${world.tableIds[2]}/release`).set(bearer(owner));
  });

  it("sends a takeaway to the kitchen straight away when the switch is off", async () => {
    await Restaurant.updateOne({ _id: world.restaurantId }, { $set: { "billingSettings.takeawayPayFirst": false } });
    const sent = await takeaway("takeaway-pay-after");
    expect(sent.status).toBe(201);
    expect(sent.body.kot).not.toBeNull();
  });

  it("clears the retired dine-in setting when how you serve is saved", async () => {
    await setDineInPayment("upfront");
    const res = await api()
      .put("/api/restaurant/settings")
      .set(bearer(owner))
      .send({ serviceFlow: "restaurant", billingSettings: { takeawayPayFirst: true } });
    expect(res.status).toBe(200);
    const saved = await Restaurant.findById(world.restaurantId).lean();
    expect(saved?.billingSettings?.dineInPayment).toBe("after");
    expect(saved?.billingSettings?.takeawayPayFirst).toBe(true);
    await Restaurant.updateOne({ _id: world.restaurantId }, { $set: { "billingSettings.takeawayPayFirst": false } });
  });
});
