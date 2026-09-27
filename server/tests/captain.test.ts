import { beforeAll, describe, expect, it } from "vitest";

import TableModel from "../src/models/Table";
import { api, bearer, createWorld, loginAdmin, World } from "./fixtures";

const CAPTAIN_PRESET = { orders: "edit", tables: "view", kot: "edit", messages: "edit" };

let world: World;
let owner: string;
let captain: string;
let captainId: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
  const created = await api()
    .post("/api/admins")
    .set(bearer(owner))
    .send({ username: "ravi", password: "Captain@1", permissions: CAPTAIN_PRESET });
  captainId = created.body.id ?? created.body._id;
  captain = await loginAdmin("ravi", "Captain@1");
});

const floor = async (token = captain) => (await api().get("/api/pos/floor").set(bearer(token))).body;

describe("table assignment", () => {
  it("lists staff who can take orders and assigns a table to one of them", async () => {
    const staff = await api().get("/api/tables/captains").set(bearer(owner));
    expect(staff.body.map((s: { username: string }) => s.username)).toEqual(["manager", "owner", "ravi"]);

    const res = await api().put(`/api/tables/${world.tableIds[0]}/captain`).set(bearer(owner)).send({ captainId });
    expect(res.status).toBe(200);
    const tables = (await floor()).tables;
    expect(tables[0]).toMatchObject({ code: "tbl1", captainId, captainName: "ravi" });
    expect(tables[1]).toMatchObject({ captainId: null, captainName: null });
  });

  it("rejects unknown staff and needs Tables edit", async () => {
    const unknown = await api()
      .put(`/api/tables/${world.tableIds[1]}/captain`)
      .set(bearer(owner))
      .send({ captainId: world.tableIds[0] });
    expect(unknown.status).toBe(404);
    expect(unknown.body.message).toBe("Staff member not found");
    const own = await api().put(`/api/tables/${world.tableIds[1]}/captain`).set(bearer(captain)).send({ captainId });
    expect(own.status).toBe(403);
  });
});

describe("captain taking an order", () => {
  let orderId: string;

  it("opens a table with a guest count and sends a four-item order to the kitchen", async () => {
    const res = await api()
      .post("/api/pos/orders")
      .set(bearer(captain))
      .send({
        orderType: "dine-in",
        tableId: world.tableIds[0],
        members: 4,
        items: [
          { foodItemId: world.food.coffee, quantity: 2 },
          { foodItemId: world.food.dosa, quantity: 1 },
          { foodItemId: world.food.vada, quantity: 1 },
        ],
      });
    expect(res.status).toBe(201);
    orderId = res.body.order._id;
    expect(res.body.order.members).toBe(4);
    expect(res.body.kot.round).toBe(1);
  });

  it("sees ready items in the kitchen queue and marks them served", async () => {
    const queue = await api().get("/api/orders/kot/queue").set(bearer(captain));
    const items = queue.body.find((g: { order: { _id: string } }) => g.order._id === orderId).items;
    await api().patch(`/api/orders/items/${items[0]._id}/preparing`).set(bearer(owner));
    expect((await api().patch(`/api/orders/items/${items[0]._id}/ready`).set(bearer(owner))).status).toBe(200);
    expect((await floor()).tables[0].orders[0].ready).toBe(1);
    const served = await api().patch(`/api/orders/items/${items[0]._id}/serve`).set(bearer(captain));
    expect(served.status).toBe(200);
    expect(served.body.status).toBe("served");
    expect((await floor()).tables[0].orders[0]).toMatchObject({ itemCount: 4, ready: 0 });
  });

  it("requests the bill, which moves the table to awaiting payment", async () => {
    const bill = await api().post(`/api/orders/${orderId}/bill`).set(bearer(captain)).send({});
    expect(bill.status).toBe(200);
    expect((await TableModel.findById(world.tableIds[0]))!.status).toBe("awaiting_payment");
  });

  it("cannot reach settings or admin users", async () => {
    expect((await api().get("/api/restaurant/settings").set(bearer(captain))).status).toBe(403);
    expect((await api().get("/api/admins").set(bearer(captain))).status).toBe(403);
  });
});

describe("removing a captain", () => {
  it("clears their table assignments", async () => {
    await api().delete(`/api/admins/${captainId}`).set(bearer(owner));
    expect((await floor(owner)).tables[0]).toMatchObject({ captainId: null, captainName: null });
  });
});
