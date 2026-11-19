import { beforeAll, describe, expect, it } from "vitest";

import Order from "../src/models/Order";
import TableModel from "../src/models/Table";
import { api, bearer, createWorld, loginAdmin, seatTable, World } from "./fixtures";

let world: World;
let owner: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
});

/** A guest at table `n` with one dish that the kitchen has: the bill is unpaid. */
async function guestWithFood(n: number) {
  const seat = await seatTable(n);
  await api()
    .post(`/api/orders/${seat.orderId}/items`)
    .set(bearer(seat.token))
    .send({ items: [{ foodItemId: world.food.dosa, quantity: 1 }] });
  await api().post(`/api/orders/${seat.orderId}/kot/print`).set(bearer(owner));
  return seat;
}
const tableStatus = async (n: number) => (await TableModel.findById(world.tableIds[n - 1]))!.status;
const floor = async () => (await api().get("/api/pos/floor").set(bearer(owner))).body;

describe("pay at the counter", () => {
  it("frees the table at once while the bill stays open for the POS and Admin", async () => {
    const seat = await guestWithFood(1);
    expect(await tableStatus(1)).toBe("occupied");

    const res = await api().post(`/api/orders/${seat.orderId}/pay-at-counter`).set(bearer(seat.token));
    expect(res.status).toBe(200);
    expect(res.body.released).toBe(true);
    expect(await tableStatus(1)).toBe("available");
    expect((await Order.findById(seat.orderId))!.payAtCounter).toBe(true);

    // The POS lists it with the counter bills, not on the table.
    const { tables, takeaways } = await floor();
    const mine = takeaways.find((o: { _id: string }) => o._id === seat.orderId);
    expect(mine).toEqual(expect.objectContaining({ payAtCounter: true, tableCode: "tbl1", status: "open" }));
    expect(tables.find((t: { code: string }) => t.code === "tbl1").orders).toEqual([]);
    // Admin finds it under unpaid orders.
    const unpaid = await api().get("/api/orders").query({ status: "unpaid" }).set(bearer(owner));
    expect(unpaid.body.map((o: { _id: string }) => o._id)).toContain(seat.orderId);
  });

  it("settles later without touching whoever sits at the table now", async () => {
    const seat = await guestWithFood(2);
    await api().post(`/api/orders/${seat.orderId}/pay-at-counter`).set(bearer(seat.token));
    expect(await tableStatus(2)).toBe("available");

    // A new party is seated at the same table and has not ordered yet.
    const next = await api().post("/api/auth/table/login").send({ code: "tbl2", password: "pass2", startNewOrder: true });
    expect(next.status).toBe(200);
    expect(await tableStatus(2)).toBe("occupied");

    const paid = await api()
      .patch(`/api/orders/${seat.orderId}/pay`)
      .set(bearer(owner))
      .send({ paymentMethod: "cash" });
    expect(paid.status).toBe(200);
    expect(paid.body.status).toBe("closed");
    expect(await tableStatus(2)).toBe("occupied");
  });

  it("is only for the guest's own unpaid order", async () => {
    const seat = await guestWithFood(3);
    expect((await api().post(`/api/orders/${seat.orderId}/pay-at-counter`).set(bearer(owner))).status).toBe(403);
    expect((await api().post(`/api/orders/${seat.orderId}/pay-at-counter`)).status).toBe(401);
  });

  it("lets staff free a table that still owes a bill, leaving the bill for the counter", async () => {
    const seat = await guestWithFood(1);
    const freed = await api().patch(`/api/tables/${world.tableIds[0]}/status`).set(bearer(owner)).send({ status: "available" });
    expect(freed.status).toBe(200);
    expect(freed.body.status).toBe("available");
    expect((await Order.findById(seat.orderId))!.payAtCounter).toBe(true);
    const { takeaways } = await floor();
    expect(takeaways.map((o: { _id: string }) => o._id)).toContain(seat.orderId);
  });
});

describe("a guest leaving the table", () => {
  it("can leave before ordering, but not once an order is placed", async () => {
    const empty = await seatTable(1);
    expect((await api().patch("/api/tables/session/release").set(bearer(empty.token))).body.released).toBe(true);
    expect(await tableStatus(1)).toBe("available");

    const seat = await guestWithFood(1);
    const refused = await api().patch("/api/tables/session/release").set(bearer(seat.token));
    expect(refused.status).toBe(409);
    expect(refused.body.message).toMatch(/once an order is placed/);
    expect(await tableStatus(1)).toBe("occupied");
    expect((await Order.findById(seat.orderId))!.status).toBe("open");
  });
});
