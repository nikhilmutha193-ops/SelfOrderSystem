import { beforeAll, describe, expect, it } from "vitest";

import { api, bearer, counterOrder, createWorld, loginAdmin, World } from "./fixtures";

let world: World;
let owner: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
});

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const report = (token = owner, from = day(-1), to = day(1)) =>
  api().get(`/api/gst/report?from=${from}&to=${to}`).set(bearer(token));

async function paidBill(foodItemId: string, quantity: number) {
  const id = await counterOrder(owner, [{ foodItemId, quantity }]);
  await api().post(`/api/orders/${id}/bill`).set(bearer(owner)).send({});
  await api().patch(`/api/orders/${id}/pay`).set(bearer(owner)).send({ paymentMethod: "cash" });
  return id;
}

describe("GST report", () => {
  it("is empty before any invoice", async () => {
    const res = await report();
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ invoices: 0, gst: 0, taxableValue: 0 });
  });

  it("adds up the tax saved on each bill, by tax, rate and day", async () => {
    await paidBill(world.food.coffee, 1); // 100 + 2.5% + 2.5% = 105
    await paidBill(world.food.dosa, 2); // 240 + 12 = 252
    const res = await report();
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ invoices: 2, taxableValue: 340, gst: 17, invoiceValue: 357 });
    expect(res.body.byComponent).toEqual([
      expect.objectContaining({ name: "CGST", percent: 2.5, taxableValue: 340, amount: 8.5, invoices: 2 }),
      expect.objectContaining({ name: "SGST", percent: 2.5, taxableValue: 340, amount: 8.5, invoices: 2 }),
    ]);
    expect(res.body.bySlab).toEqual([expect.objectContaining({ rate: 5, taxableValue: 340, gst: 17, invoices: 2 })]);
    expect(res.body.b2c.invoices).toBe(2);
    expect(res.body.byDay.reduce((n: number, d: { invoices: number }) => n + d.invoices, 0)).toBe(2);
    expect(res.body.invoices).toHaveLength(2);
  });

  it("leaves voided invoices out of the totals but lists them", async () => {
    const id = await paidBill(world.food.vada, 1); // 60 + 3 = 63
    const before = (await report()).body.summary;
    const voided = await api().post(`/api/orders/${id}/void`).set(bearer(owner)).send({ reason: "Billed by mistake" });
    expect(voided.status).toBe(200);
    const after = await report();
    expect(after.body.summary.invoices).toBe(before.invoices - 1);
    expect(after.body.excluded.voided).toEqual({ count: 1, value: 63 });
    expect(after.body.invoices.some((r: { status: string }) => r.status === "voided")).toBe(true);
  });

  it("checks the dates and the permission", async () => {
    expect((await report(owner, day(1), day(-1))).status).toBe(400);
    expect((await report(owner, "2020-01-01", "2026-12-31")).status).toBe(400);
    const manager = await loginAdmin("manager", "Manager@123");
    expect((await report(manager)).status).toBe(403);
  });
});
