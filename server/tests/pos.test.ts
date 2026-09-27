import { beforeAll, describe, expect, it } from "vitest";

import Order from "../src/models/Order";
import OrderItem from "../src/models/OrderItem";
import TableModel from "../src/models/Table";
import { api, bearer, createWorld, loginAdmin, loginChef, World } from "./fixtures";

let world: World;
let owner: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
});

const createPos = (body: object, key?: string) =>
  api()
    .post("/api/pos/orders")
    .set({ ...bearer(owner), ...(key && { "Idempotency-Key": key }) })
    .send(body);

describe("short codes", () => {
  it("saves, rejects duplicates and bad codes, and clears a short code", async () => {
    const set = await api().put(`/api/food-items/${world.food.coffee}`).set(bearer(owner)).send({ shortCode: " fc " });
    expect(set.status).toBe(200);
    expect(set.body.shortCode).toBe("FC");

    const dup = await api().put(`/api/food-items/${world.food.dosa}`).set(bearer(owner)).send({ shortCode: "fc" });
    expect(dup.status).toBe(409);
    expect(dup.body.message).toBe("Short code FC is already used by Filter Coffee");

    const bad = await api().put(`/api/food-items/${world.food.dosa}`).set(bearer(owner)).send({ shortCode: "MD-1" });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toBe("Short code must be 1 to 6 letters or digits");

    await api().put(`/api/food-items/${world.food.dosa}`).set(bearer(owner)).send({ shortCode: "MD" });
    await api().put(`/api/food-items/${world.food.vada}`).set(bearer(owner)).send({ shortCode: "MV" });
    const cleared = await api().put(`/api/food-items/${world.food.vada}`).set(bearer(owner)).send({ shortCode: "" });
    expect(cleared.body.shortCode).toBeUndefined();
    const reused = await api().put(`/api/food-items/${world.food.vada}`).set(bearer(owner)).send({ shortCode: "MV" });
    expect(reused.status).toBe(200);
  });
});

describe("POS menu", () => {
  it("lists visible items with short codes and modifiers, and answers 304 when unchanged", async () => {
    const res = await api().get("/api/pos/menu").set(bearer(owner));
    expect(res.status).toBe(200);
    expect(res.body.categories).toEqual([expect.objectContaining({ name: "Breakfast" })]);
    const names = res.body.items.map((i: { name: string }) => i.name);
    expect(names).toEqual(["Filter Coffee", "Masala Dosa", "Medu Vada"]);
    expect(res.body.items[0]).toMatchObject({ shortCode: "FC", price: 100, modifierGroups: [{ name: "Size" }] });

    const again = await api()
      .get("/api/pos/menu")
      .set({ ...bearer(owner), "If-None-Match": res.headers.etag });
    expect(again.status).toBe(304);
  });

  it("is for staff with Orders access only", async () => {
    const chef = await loginChef();
    expect((await api().get("/api/pos/menu").set(bearer(chef))).status).toBe(403);
    const manager = await loginAdmin("manager", "Manager@123");
    expect((await api().get("/api/pos/menu").set(bearer(manager))).status).toBe(200);
  });
});

describe("creating an order in one call", () => {
  it("creates a takeaway with its items and sends the KOT", async () => {
    const res = await createPos({
      orderType: "takeaway",
      items: [
        { foodItemId: world.food.coffee, quantity: 2, modifiers: [{ groupName: "Size", label: "Large" }] },
        { foodItemId: world.food.dosa, quantity: 1, note: "less oil" },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({ orderType: "takeaway", customerName: "Walk-in", status: "open" });
    expect(res.body.kot).toEqual({ round: 1, tokenNumber: expect.any(Number) });
    const items = await OrderItem.find({ orderId: res.body.order._id }).sort({ foodName: 1 }).lean();
    expect(items.map((i) => [i.foodName, i.quantity, i.unitPrice, i.kotRound])).toEqual([
      ["Filter Coffee", 2, 140, 1],
      ["Masala Dosa", 1, 120, 1],
    ]);
  });

  it("can hold the items without sending them to the kitchen", async () => {
    const res = await createPos({
      orderType: "takeaway",
      customerName: "Ravi",
      sendToKitchen: false,
      items: [{ foodItemId: world.food.vada, quantity: 3 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.kot).toBeNull();
    expect((await OrderItem.findOne({ orderId: res.body.order._id }))!.kotRound).toBeNull();
  });

  it("returns the same order when the request is retried", async () => {
    const body = {
      orderType: "takeaway",
      customerName: "Retry",
      items: [{ foodItemId: world.food.vada, quantity: 1 }],
    };
    const first = await createPos(body, "pos-retry-key-1");
    const second = await createPos(body, "pos-retry-key-1");
    expect(second.status).toBe(201);
    expect(second.body.order._id).toBe(first.body.order._id);
    expect(await Order.countDocuments({ customerName: "Retry" })).toBe(1);
  });

  it("seats a dine-in order on a table and refuses a second order on it", async () => {
    const res = await createPos({
      orderType: "dine-in",
      tableId: world.tableIds[0],
      members: 3,
      items: [{ foodItemId: world.food.dosa, quantity: 2 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({ customerName: "Guest", members: 3, tableId: world.tableIds[0] });
    expect((await TableModel.findById(world.tableIds[0]))!.status).toBe("occupied");

    const again = await createPos({
      orderType: "dine-in",
      tableId: world.tableIds[0],
      items: [{ foodItemId: world.food.dosa, quantity: 1 }],
    });
    expect(again.status).toBe(409);
    expect(again.body.message).toBe("This table is already occupied");

    const noTable = await createPos({ orderType: "dine-in", items: [{ foodItemId: world.food.dosa, quantity: 1 }] });
    expect(noTable.status).toBe(400);
    expect(noTable.body.message).toBe("Choose a table for a dine-in order");
  });

  it("creates nothing when an item is off the menu", async () => {
    const before = await Order.countDocuments();
    const res = await createPos({
      orderType: "takeaway",
      items: [
        { foodItemId: world.food.dosa, quantity: 1 },
        { foodItemId: world.food.hidden, quantity: 1 },
      ],
    });
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("One of these items is no longer on the menu");
    expect(await Order.countDocuments()).toBe(before);
  });
});

describe("floor", () => {
  it("shows tables with their running order and the open takeaways", async () => {
    const res = await api().get("/api/pos/floor").set(bearer(owner));
    expect(res.status).toBe(200);
    const table = res.body.tables.find((t: { code: string }) => t.code === "tbl1");
    expect(table.status).toBe("occupied");
    expect(table.orders).toEqual([expect.objectContaining({ itemCount: 2, total: 240, unsent: 0, status: "open" })]);
    expect(res.body.tables.find((t: { code: string }) => t.code === "tbl2").orders).toEqual([]);

    const ravi = res.body.takeaways.find((o: { customerName: string }) => o.customerName === "Ravi");
    expect(ravi).toMatchObject({ itemCount: 3, total: 180, unsent: 1 });

    const orderId = ravi._id;
    await api().post(`/api/orders/${orderId}/kot/print`).set(bearer(owner));
    await api().patch(`/api/orders/${orderId}/pay`).set(bearer(owner)).send({ paymentMethod: "cash" });
    const after = await api().get("/api/pos/floor").set(bearer(owner));
    expect(after.body.takeaways.some((o: { _id: string }) => o._id === orderId)).toBe(false);
  });

  it("shows a billed order's saved grand total", async () => {
    const seated = (await api().get("/api/pos/floor").set(bearer(owner))).body.tables[0].orders[0];
    await api().post(`/api/orders/${seated._id}/bill`).set(bearer(owner)).send({});
    const res = await api().get("/api/pos/floor").set(bearer(owner));
    const table = res.body.tables[0];
    expect(table.status).toBe("awaiting_payment");
    expect(table.orders[0]).toMatchObject({ status: "billed", total: 252, invoiceNumber: expect.any(String) });
  });
});
