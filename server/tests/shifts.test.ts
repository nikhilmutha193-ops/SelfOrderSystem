import { beforeAll, describe, expect, it } from "vitest";

import { api, bearer, counterOrder, createWorld, loginAdmin, World } from "./fixtures";

let world: World;
let owner: string;
let manager: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
  manager = await loginAdmin("manager", "Manager@123");
});

const settle = (orderId: string, payments: object[]) =>
  api().patch(`/api/orders/${orderId}/pay`).set(bearer(owner)).send({ payments });

describe("cash shifts", () => {
  it("tracks the float, cash sales and cash movements, and reports the variance at close", async () => {
    expect((await api().get("/api/shifts/current").set(bearer(owner))).body).toEqual({ shift: null });
    expect((await api().get("/api/shifts/current").set(bearer(manager))).status).toBe(403);

    const opened = await api().post("/api/shifts/open").set(bearer(owner)).send({ openingFloat: 500 });
    expect(opened.status).toBe(201);
    expect((await api().post("/api/shifts/open").set(bearer(owner)).send({ openingFloat: 100 })).status).toBe(409);

    const cashOrder = await counterOrder(owner, [{ foodItemId: world.food.dosa, quantity: 1 }]);
    await settle(cashOrder, [{ method: "cash", amount: 126, tendered: 200 }]);
    const upiOrder = await counterOrder(owner, [{ foodItemId: world.food.vada, quantity: 1 }]);
    await settle(upiOrder, [{ method: "upi", amount: 63 }]);

    await api()
      .post("/api/shifts/current/cash")
      .set(bearer(owner))
      .send({ type: "out", amount: 40, reason: "Bought milk" });
    const current = (await api().get("/api/shifts/current").set(bearer(owner))).body.shift;
    expect(current).toMatchObject({ openingFloat: 500, cashSales: 126, cashOut: 40, expectedCash: 586 });

    const closed = await api()
      .post("/api/shifts/current/close")
      .set(bearer(owner))
      .send({ countedCash: 580, note: "Short by 6" });
    expect(closed.body).toMatchObject({ isOpen: false, expectedCash: 586, countedCash: 580, variance: -6 });
    expect((await api().get("/api/shifts/current").set(bearer(owner))).body.shift).toBeNull();
  });
});

describe("closing the day", () => {
  it("blocks the close while bills are unpaid unless they are carried forward", async () => {
    const unpaid = await counterOrder(owner, [{ foodItemId: world.food.dosa, quantity: 1 }], "Still eating");
    const preview = await api().get("/api/day-close/preview").set(bearer(owner));
    expect(preview.body.unsettled.map((u: { orderId: string }) => u.orderId)).toContain(unpaid);
    expect(preview.body.totals).toMatchObject({ bills: 2, net: 189 });
    expect(preview.body.byPaymentMethod).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "cash", amount: 126 }),
        expect.objectContaining({ name: "upi", amount: 63 }),
      ])
    );
    expect(preview.body.byCategory).toEqual([expect.objectContaining({ name: "Breakfast", amount: 180 })]);
    expect(preview.body.invoiceRange.count).toBe(2);

    const blocked = await api().post("/api/day-close").set(bearer(owner)).send({});
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toBe("1 order is still unpaid. Settle it or carry it forward.");

    const closed = await api().post("/api/day-close").set(bearer(owner)).send({ carryForward: true });
    expect(closed.status).toBe(200);
    expect(closed.body.closed).toBeTruthy();
    expect((await api().post("/api/day-close").set(bearer(owner)).send({ carryForward: true })).status).toBe(409);

    const history = await api().get("/api/day-close").set(bearer(owner));
    expect(history.body[0].businessDate).toBe(preview.body.businessDate);
    const saved = await api().get(`/api/day-close/${preview.body.businessDate}`).set(bearer(owner));
    expect(saved.body.report.totals.net).toBe(189);
  });

  it("stops non-owners from changing bills from a closed day", async () => {
    const orderId = await counterOrder(owner, [{ foodItemId: world.food.vada, quantity: 1 }], "Closed day bill");
    const billed = await api().post(`/api/orders/${orderId}/bill`).set(bearer(owner)).send({});
    expect(billed.status).toBe(200);

    const managerReopen = await api()
      .post(`/api/orders/${orderId}/reopen`)
      .set(bearer(manager))
      .send({ reason: "Late change" });
    expect(managerReopen.status).toBe(409);
    expect(managerReopen.body.message).toMatch(/^The day \d{4}-\d{2}-\d{2} is closed/);

    const ownerReopen = await api()
      .post(`/api/orders/${orderId}/reopen`)
      .set(bearer(owner))
      .send({ reason: "Owner override" });
    expect(ownerReopen.status).toBe(200);
  });
});
