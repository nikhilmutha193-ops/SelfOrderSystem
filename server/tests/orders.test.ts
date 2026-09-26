import { beforeAll, describe, expect, it } from "vitest";

import { DomainEventName, on } from "../src/core/events";
import Coupon from "../src/models/Coupon";
import OrderItem from "../src/models/OrderItem";
import TableModel from "../src/models/Table";
import { api, bearer, createWorld, loginAdmin, seatTable, World } from "./fixtures";

let world: World;
let owner: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
});

describe("starting orders", () => {
  it("rejects a missing customer name with the message the client shows", async () => {
    const login = await api().post("/api/auth/table/login").send({ code: "tbl3", password: "pass3" });
    const res = await api().post("/api/orders/dine-in").set(bearer(login.body.token)).send({ customerPhone: "1" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("customerName is required");
  });

  it("defaults members to 1 when the client sends null", async () => {
    const res = await api()
      .post("/api/orders/takeaway")
      .set(bearer(owner))
      .send({ customerName: "Walk-in", members: null });
    expect(res.status).toBe(201);
    expect(res.body.members).toBe(1);
    expect(res.body.source).toBe("counter");
  });

  it("rejects an unknown delivery provider", async () => {
    const res = await api()
      .post("/api/orders/delivery")
      .set(bearer(owner))
      .send({ provider: "Foo", customerName: "D" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("A valid provider is required");
  });

  it("refuses a counter order on an occupied table unless allowed", async () => {
    await seatTable(2);
    const res = await api()
      .post("/api/orders/counter")
      .set(bearer(owner))
      .send({ customerName: "C", tableId: world.tableIds[1] });
    expect(res.status).toBe(409);
  });
});

describe("adding items", () => {
  it("prices items on the server, applies real modifiers and ignores unknown ones", async () => {
    const { token, orderId } = await seatTable(1);
    const res = await api()
      .post(`/api/orders/${orderId}/items`)
      .set(bearer(token))
      .send({
        items: [
          {
            foodItemId: world.food.coffee,
            quantity: 2,
            note: "  less sugar  ",
            modifiers: [
              { groupName: "Size", label: "Large" },
              { groupName: "Fake", label: "Free" },
            ],
          },
          { foodItemId: world.food.dosa, quantity: 1 },
        ],
      });
    expect(res.status).toBe(201);
    const [coffee, dosa] = res.body;
    expect(coffee.unitPrice).toBe(140);
    expect(coffee.total).toBe(280);
    expect(coffee.note).toBe("less sugar");
    expect(coffee.modifiers).toEqual([{ groupName: "Size", label: "Large", priceDelta: 40 }]);
    expect(dosa.total).toBe(120);
  });

  it("checks every line before saving any of them", async () => {
    const { token, orderId } = await seatTable(3, "Ravi");
    const res = await api()
      .post(`/api/orders/${orderId}/items`)
      .set(bearer(token))
      .send({
        items: [
          { foodItemId: world.food.vada, quantity: 1 },
          { foodItemId: world.food.hidden, quantity: 1 },
        ],
      });
    expect(res.status).toBe(404);
    expect(res.body.message).toBe(`Food item ${world.food.hidden} is not available`);
    expect(await OrderItem.countDocuments({ orderId })).toBe(0);
  });

  it("validates quantity and item ids", async () => {
    const takeaway = await api().post("/api/orders/takeaway").set(bearer(owner)).send({ customerName: "Q" });
    const url = `/api/orders/${takeaway.body._id}/items`;
    const zero = await api()
      .post(url)
      .set(bearer(owner))
      .send({ items: [{ foodItemId: world.food.vada, quantity: 0 }] });
    expect(zero.body.message).toBe("quantity must be at least 1");
    const badId = await api()
      .post(url)
      .set(bearer(owner))
      .send({ items: [{ foodItemId: "nope", quantity: 1 }] });
    expect(badId.body.message).toBe("Invalid foodItemId");
    const empty = await api().post(url).set(bearer(owner)).send({ items: [] });
    expect(empty.body.message).toBe("items must be a non-empty array");
  });

  it("stops one table from touching another table's order", async () => {
    const mine = await seatTable(1, "Mine");
    const theirs = await api().post("/api/orders/takeaway").set(bearer(owner)).send({ customerName: "Theirs" });
    const res = await api().get(`/api/orders/${theirs.body._id}`).set(bearer(mine.token));
    expect(res.status).toBe(403);
  });
});

describe("coupons, paying and cancelling", () => {
  it("applies a coupon without counting a use until the bill is generated", async () => {
    const { token, orderId } = await seatTable(1, "Coupon");
    await api()
      .post(`/api/orders/${orderId}/items`)
      .set(bearer(token))
      .send({ items: [{ foodItemId: world.food.dosa, quantity: 2 }] });

    const below = await api().post(`/api/orders/${orderId}/coupon`).set(bearer(token)).send({ code: "big50" });
    expect(below.status).toBe(400);

    const applied = await api().post(`/api/orders/${orderId}/coupon`).set(bearer(token)).send({ code: " save10 " });
    expect(applied.status).toBe(200);
    expect(applied.body.order.couponCode).toBe("SAVE10");
    expect(applied.body.totals).toMatchObject({ subtotal: 240, discount: 24, roundOff: 0.2, grandTotal: 227 });
    expect((await Coupon.findOne({ code: "SAVE10" }))!.usedCount).toBe(0);

    await api().delete(`/api/orders/${orderId}/coupon`).set(bearer(token));
    expect((await Coupon.findOne({ code: "SAVE10" }))!.usedCount).toBe(0);
  });

  it("closes an order on payment and frees its table", async () => {
    const { token, orderId } = await seatTable(1, "Payer");
    await api()
      .post(`/api/orders/${orderId}/items`)
      .set(bearer(token))
      .send({ items: [{ foodItemId: world.food.vada, quantity: 1 }] });

    const bad = await api().patch(`/api/orders/${orderId}/pay`).set(bearer(owner)).send({ paymentMethod: "gold" });
    expect(bad.status).toBe(400);

    const paid = await api().patch(`/api/orders/${orderId}/pay`).set(bearer(owner)).send({ paymentMethod: "cash" });
    expect(paid.status).toBe(200);
    expect(paid.body.status).toBe("closed");
    expect((await TableModel.findById(world.tableIds[0]))!.status).toBe("available");

    const again = await api().patch(`/api/orders/${orderId}/pay`).set(bearer(owner)).send({ paymentMethod: "cash" });
    expect(again.status).toBe(409);
    const cancel = await api().patch(`/api/orders/${orderId}/cancel`).set(bearer(owner));
    expect(cancel.body.message).toBe("This bill is already paid. Void it instead.");
  });

  it("emits domain events for the order lifecycle", async () => {
    const seen: string[] = [];
    const names: DomainEventName[] = ["order.created", "order.itemsAdded", "order.settled"];
    const stops = names.map((name) => on(name, () => void seen.push(name)));
    try {
      const created = await api().post("/api/orders/takeaway").set(bearer(owner)).send({ customerName: "Events" });
      await api()
        .post(`/api/orders/${created.body._id}/items`)
        .set(bearer(owner))
        .send({ items: [{ foodItemId: world.food.vada, quantity: 1 }] });
      await api().patch(`/api/orders/${created.body._id}/pay`).set(bearer(owner)).send({ paymentMethod: "upi" });
      await api().patch(`/api/orders/${created.body._id}/pay`).set(bearer(owner)).send({ paymentMethod: "card" });
    } finally {
      stops.forEach((stop) => stop());
    }
    expect(seen).toEqual(["order.created", "order.itemsAdded", "order.settled"]);
  });
});

describe("listing and reports", () => {
  it("rejects an unknown order type filter", async () => {
    const res = await api().get("/api/orders").set(bearer(owner)).query({ type: "boat" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid order type");
  });

  it("returns today's orders with a kitchen summary", async () => {
    const res = await api().get("/api/orders").set(bearer(owner)).query({ today: "true" });
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].kitchen).toEqual(
      expect.objectContaining({ active: expect.any(Number), pendingUnsent: expect.any(Number) })
    );
  });

  it("exports a CSV that Excel reads as UTF-8 and ends with a total row", async () => {
    const res = await api()
      .get("/api/orders/report.csv")
      .set(bearer(owner))
      .buffer(true)
      .parse((response, callback) => {
        let text = "";
        response.on("data", (chunk: Buffer) => (text += chunk.toString("utf8")));
        response.on("end", () => callback(null, text));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="orders-all-/);
    const csv = res.body as string;
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.trim().split("\r\n").pop()).toMatch(/"Total \(\d+\)"/);
  });

  it("lets only the owner clear orders", async () => {
    const manager = await loginAdmin("manager", "Manager@123");
    const denied = await api().delete("/api/orders").set(bearer(manager)).query({ type: "takeaway" });
    expect(denied.status).toBe(403);
    const cleared = await api().delete("/api/orders").set(bearer(owner)).query({ type: "takeaway" });
    expect(cleared.status).toBe(200);
    expect(cleared.body.deleted).toBeGreaterThan(0);
  });
});
