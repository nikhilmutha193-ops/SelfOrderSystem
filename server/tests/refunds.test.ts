import { beforeAll, describe, expect, it } from "vitest";

import Order from "../src/models/Order";
import OrderItem from "../src/models/OrderItem";
import {
  api,
  bearer,
  counterOrder,
  createWorld,
  loginAdmin,
  World,
} from "./fixtures";

let world: World;
let owner: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
});

// 2 dosas (240) + 1 vada (60) = 300, GST 5% = 15, so the bill is 315.
async function paidBill(method = "cash") {
  const id = await counterOrder(owner, [
    { foodItemId: world.food.dosa, quantity: 2 },
    { foodItemId: world.food.vada, quantity: 1 },
  ]);
  const paid = await api()
    .patch(`/api/orders/${id}/pay`)
    .set(bearer(owner))
    .send({ paymentMethod: method });
  expect(paid.status).toBe(200);
  const items = await OrderItem.find({ orderId: id }).lean();
  const item = (foodId: string) =>
    items.find((i) => i.foodItemId?.toString() === foodId)!._id.toString();
  return { id, dosa: item(world.food.dosa), vada: item(world.food.vada) };
}

const refund = (body: object, token = owner) =>
  api().post("/api/refunds").set(bearer(token)).send(body);

describe("refunds on a paid bill", () => {
  it("shows what can be refunded", async () => {
    const { id } = await paidBill();
    const res = await api().get(`/api/refunds/order/${id}`).set(bearer(owner));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      canRefund: true,
      paid: 315,
      refunded: 0,
      refundable: 315,
    });
    expect(
      res.body.items.find(
        (i: { foodName: string }) => i.foodName === "Medu Vada",
      ),
    ).toMatchObject({
      refundableQty: 1,
      unitRefund: 63,
    });
  });

  it("refunds a whole item with its share of tax, and takes it off the kitchen's list", async () => {
    const { id, vada } = await paidBill();
    const res = await refund({
      orderId: id,
      items: [{ itemId: vada }],
      method: "cash",
      reason: "customer_cancelled",
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      amount: 63,
      method: "cash",
      kind: "items",
    });

    const order = await Order.findById(id).lean();
    expect(order?.refundedTotal).toBe(63);
    expect(order?.status).toBe("closed");
    const item = await OrderItem.findById(vada).lean();
    expect(item).toMatchObject({
      status: "cancelled",
      refundedQty: 1,
      cancelReason: "refunded",
    });
  });

  it("takes every item off the kitchen's list when the whole payment goes back", async () => {
    const { id } = await paidBill();
    const res = await refund({
      orderId: id,
      amount: 315,
      method: "cash",
      reason: "customer_cancelled",
    });
    expect(res.status).toBe(201);
    const items = await OrderItem.find({ orderId: id }).lean();
    expect(items.every((i) => i.status === "cancelled")).toBe(true);
    const queue = await api().get("/api/orders/kot/queue").set(bearer(owner));
    expect(
      queue.body.some((g: { order: { _id: string } }) => g.order._id === id),
    ).toBe(false);
  });

  it("takes refunds off the analytics revenue and top dishes", async () => {
    const before = (
      await api().get("/api/analytics/sales?days=1").set(bearer(owner))
    ).body;
    const { id, vada } = await paidBill();
    await refund({
      orderId: id,
      items: [{ itemId: vada }],
      method: "cash",
      reason: "customer_cancelled",
    });
    const after = (
      await api().get("/api/analytics/sales?days=1").set(bearer(owner))
    ).body;
    expect(after.totalRefunds - (before.totalRefunds ?? 0)).toBe(63);
    // The bill was 315 and 63 went back.
    expect(after.totalRevenue - before.totalRevenue).toBeCloseTo(315 - 63, 2);
    expect(after.grossRevenue - before.grossRevenue).toBeCloseTo(315, 2);
    expect(after.byDay[after.byDay.length - 1].refunds).toBeGreaterThanOrEqual(
      63,
    );
  });

  it("refunds part of a quantity and leaves the rest cooking", async () => {
    const { id, dosa } = await paidBill();
    const res = await refund({
      orderId: id,
      items: [{ itemId: dosa, quantity: 1 }],
      method: "upi",
      reason: "quality_issue",
    });
    expect(res.status).toBe(201);
    expect(res.body.amount).toBe(126);
    const item = await OrderItem.findById(dosa).lean();
    expect(item).toMatchObject({ refundedQty: 1 });
    expect(item?.status).not.toBe("cancelled");

    const again = await refund({
      orderId: id,
      items: [{ itemId: dosa, quantity: 2 }],
      method: "upi",
      reason: "quality_issue",
    });
    expect(again.status).toBe(400);
    expect(again.body.message).toBe(
      "Only 1 of Masala Dosa can still be refunded",
    );
  });

  it("refunds an agreed amount and never more than was paid", async () => {
    const { id } = await paidBill();
    expect(
      (
        await refund({
          orderId: id,
          amount: 50,
          method: "cash",
          reason: "other",
          note: "Goodwill",
        })
      ).status,
    ).toBe(201);
    const tooMuch = await refund({
      orderId: id,
      amount: 300,
      method: "cash",
      reason: "other",
    });
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.message).toBe(
      "At most ₹265.00 can still be refunded on this bill",
    );
    expect(
      (
        await refund({
          orderId: id,
          amount: 265,
          method: "cash",
          reason: "other",
        })
      ).status,
    ).toBe(201);
    const none = await refund({
      orderId: id,
      amount: 1,
      method: "cash",
      reason: "other",
    });
    expect(none.status).toBe(409);
  });

  it("refuses an unpaid order, a missing reason and pay-later as a refund method", async () => {
    const open = await counterOrder(owner, [
      { foodItemId: world.food.vada, quantity: 1 },
    ]);
    const unpaid = await refund({
      orderId: open,
      amount: 10,
      method: "cash",
      reason: "other",
    });
    expect(unpaid.status).toBe(409);
    expect(unpaid.body.message).toBe("Only a paid bill can be refunded");

    const { id } = await paidBill();
    expect(
      (await refund({ orderId: id, amount: 10, method: "cash" })).status,
    ).toBe(400);
    expect(
      (
        await refund({
          orderId: id,
          amount: 10,
          method: "credit",
          reason: "other",
        })
      ).status,
    ).toBe(400);
    expect(
      (await refund({ orderId: id, method: "cash", reason: "other" })).status,
    ).toBe(400);
  });

  it("takes cash refunds out of the drawer", async () => {
    await api()
      .post("/api/shifts/open")
      .set(bearer(owner))
      .send({ openingFloat: 1000 });
    const { id } = await paidBill("cash");
    const before = (await api().get("/api/shifts/current").set(bearer(owner)))
      .body.shift;
    expect(before.cashRefunds).toBe(0);

    await refund({ orderId: id, amount: 100, method: "cash", reason: "other" });
    await refund({ orderId: id, amount: 50, method: "upi", reason: "other" });
    const after = (await api().get("/api/shifts/current").set(bearer(owner)))
      .body.shift;
    expect(after.cashRefunds).toBe(100);
    expect(after.expectedCash).toBe(before.expectedCash - 100);
  });

  it("lists refunds with totals for a period, and keeps them to staff with Orders access", async () => {
    const list = await api().get("/api/refunds").set(bearer(owner));
    expect(list.status).toBe(200);
    expect(list.body.count).toBeGreaterThan(0);
    expect(list.body.total).toBeGreaterThan(0);
    expect(list.body.byMethod.cash).toBeGreaterThan(0);

    const chef = await api()
      .post("/api/auth/chef/login")
      .send({ username: "chef1", password: "Chef@123" });
    expect(
      (await api().get("/api/refunds").set(bearer(chef.body.token))).status,
    ).toBe(403);
  });
});
