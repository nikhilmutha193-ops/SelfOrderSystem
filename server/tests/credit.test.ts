import { beforeAll, describe, expect, it } from "vitest";

import { api, bearer, counterOrder, createWorld, loginAdmin, World } from "./fixtures";

let world: World;
let owner: string;
let customerId: string;
let firstOrder: string;
let firstTotal: number;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
});

const credit = () => api().get(`/api/credit/customers/${customerId}`).set(bearer(owner));

async function attach(orderId: string) {
  const res = await api()
    .post(`/api/customers/orders/${orderId}/attach`)
    .set(bearer(owner))
    .send({ phone: "9876501234", name: "Ravi" });
  expect(res.status).toBe(200);
}

describe("pay later", () => {
  it("needs a guest on the order", async () => {
    firstOrder = await counterOrder(owner, [{ foodItemId: world.food.dosa, quantity: 2 }], "Ravi");
    const res = await api().patch(`/api/orders/${firstOrder}/pay`).set(bearer(owner)).send({ paymentMethod: "credit" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Attach the guest's phone number before putting the bill on their account");
  });

  it("puts the bill on the guest's account", async () => {
    await attach(firstOrder);
    const paid = await api().patch(`/api/orders/${firstOrder}/pay`).set(bearer(owner)).send({ paymentMethod: "credit" });
    expect(paid.status).toBe(200);
    expect(paid.body.paymentMethod).toBe("credit");
    firstTotal = paid.body.bill.grandTotal;
    customerId = paid.body.customerId;

    const res = await credit();
    expect(res.body.balance).toBe(firstTotal);
    expect(res.body.entries[0]).toMatchObject({ type: "charge", amount: firstTotal });
  });

  it("enforces the credit limit", async () => {
    await api().put(`/api/credit/customers/${customerId}/limit`).set(bearer(owner)).send({ creditLimit: firstTotal + 10 }).expect(200);
    const second = await counterOrder(owner, [{ foodItemId: world.food.dosa, quantity: 1 }], "Ravi");
    await attach(second);
    const res = await api().patch(`/api/orders/${second}/pay`).set(bearer(owner)).send({ paymentMethod: "credit" });
    expect(res.status).toBe(409);
    expect(res.body.message).toContain("credit limit");
    const cash = await api().patch(`/api/orders/${second}/pay`).set(bearer(owner)).send({ paymentMethod: "cash" });
    expect(cash.status).toBe(200);
  });

  it("collects dues, adding cash to the open shift", async () => {
    await api().post("/api/shifts/open").set(bearer(owner)).send({ openingFloat: 500 }).expect(201);
    const over = await api()
      .post(`/api/credit/customers/${customerId}/payments`)
      .set(bearer(owner))
      .send({ amount: firstTotal + 1, method: "cash" });
    expect(over.status).toBe(400);

    const part = await api()
      .post(`/api/credit/customers/${customerId}/payments`)
      .set(bearer(owner))
      .send({ amount: 100, method: "cash" });
    expect(part.status).toBe(201);
    expect(part.body.balance).toBe(firstTotal - 100);

    const shift = await api().get("/api/shifts/current").set(bearer(owner));
    expect(shift.body.shift.cashMovements.some((m: { reason: string; amount: number }) => m.reason === "Dues from Ravi" && m.amount === 100)).toBe(true);

    const dues = await api().get("/api/credit/dues").set(bearer(owner));
    expect(dues.body).toEqual([expect.objectContaining({ name: "Ravi", balance: firstTotal - 100 })]);
  });

  it("voiding the bill reverses the charge", async () => {
    const voided = await api().post(`/api/orders/${firstOrder}/void`).set(bearer(owner)).send({ reason: "Wrong bill" });
    expect(voided.status).toBe(200);
    const res = await credit();
    expect(res.body.balance).toBe(-100);
    expect(res.body.entries[0]).toMatchObject({ type: "reverse", amount: firstTotal });
  });
});
