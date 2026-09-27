import { beforeAll, describe, expect, it } from "vitest";

import TableModel from "../src/models/Table";
import { api, bearer, createWorld, loginAdmin, seatTable, World } from "./fixtures";

let world: World;
let owner: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
});

const tableStatus = async (n: number) => (await TableModel.findById(world.tableIds[n]))!.status;

async function cookedOrder(tableNumber: number) {
  const seat = await seatTable(tableNumber);
  await api()
    .post(`/api/orders/${seat.orderId}/items`)
    .set(bearer(seat.token))
    .send({ items: [{ foodItemId: world.food.dosa, quantity: 1 }] });
  await api().post(`/api/orders/${seat.orderId}/kot/print`).set(bearer(owner));
  return seat;
}

describe("tables stay blocked until the bill is paid", () => {
  it("marks the table awaiting payment when the bill is generated and frees it once paid", async () => {
    const seat = await cookedOrder(1);
    await api().post(`/api/orders/${seat.orderId}/bill`).set(bearer(owner)).send({});
    expect(await tableStatus(0)).toBe("awaiting_payment");

    const summary = await api().get("/api/dashboard/summary").set(bearer(owner));
    expect(summary.body.tablesAwaitingPayment).toBe(1);

    await api().patch(`/api/orders/${seat.orderId}/pay`).set(bearer(owner)).send({ paymentMethod: "cash" });
    expect(await tableStatus(0)).toBe("available");
  });

  it("keeps a table awaiting payment when the guest leaves with cooked, unpaid food", async () => {
    const seat = await cookedOrder(2);
    const left = await api().patch("/api/tables/session/release").set(bearer(seat.token));
    expect(left.body).toEqual({ released: true, awaitingPayment: true });
    expect(await tableStatus(1)).toBe("awaiting_payment");

    const stale = await api().get(`/api/orders/${seat.orderId}`).set(bearer(seat.token));
    expect(stale.status).toBe(401);

    await api().patch(`/api/orders/${seat.orderId}/pay`).set(bearer(owner)).send({ paymentMethod: "upi" });
    expect(await tableStatus(1)).toBe("available");
  });

  it("frees a table right away when nothing reached the kitchen", async () => {
    const seat = await seatTable(3);
    await api()
      .post(`/api/orders/${seat.orderId}/items`)
      .set(bearer(seat.token))
      .send({ items: [{ foodItemId: world.food.vada, quantity: 1 }] });
    const res = await api().patch(`/api/tables/${world.tableIds[2]}/release`).set(bearer(owner));
    expect(res.body).toMatchObject({ status: "available", cancelledOrders: 1, awaitingPayment: false });
  });

  it("does not let a staff release free a table that owes money", async () => {
    await cookedOrder(3);
    const res = await api().patch(`/api/tables/${world.tableIds[2]}/release`).set(bearer(owner));
    expect(res.body).toMatchObject({ status: "awaiting_payment", awaitingPayment: true });

    const relogin = await api().post("/api/auth/table/login").send({ code: "tbl3", password: "pass3" });
    expect(relogin.status).toBe(409);
  });
});
