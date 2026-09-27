import { beforeAll, describe, expect, it } from "vitest";

import Restaurant from "../src/models/Restaurant";
import { api, bearer, counterOrder, createWorld, loginAdmin, World } from "./fixtures";

let world: World;
let owner: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
});

const pay = (orderId: string, body: object) => api().patch(`/api/orders/${orderId}/pay`).set(bearer(owner)).send(body);

describe("settling with several payments", () => {
  it("accepts part cash and part UPI when they add up to the bill", async () => {
    const orderId = await counterOrder(owner, [{ foodItemId: world.food.dosa, quantity: 2 }]);
    const res = await pay(orderId, {
      payments: [
        { method: "cash", amount: 100, tendered: 200 },
        { method: "upi", amount: 152, reference: "UTR12345" },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.paymentMethod).toBe("split");
    expect(res.body.payments).toEqual([
      expect.objectContaining({ method: "cash", amount: 100, tendered: 200, change: 100 }),
      expect.objectContaining({ method: "upi", amount: 152, reference: "UTR12345" }),
    ]);
  });

  it("rejects payments that don't match the bill total", async () => {
    const orderId = await counterOrder(owner, [{ foodItemId: world.food.dosa, quantity: 1 }]);
    const short = await pay(orderId, { payments: [{ method: "cash", amount: 100 }] });
    expect(short.status).toBe(400);
    expect(short.body.message).toBe("Payments add up to ₹100.00 but the bill is ₹126.00");

    const lowCash = await pay(orderId, { payments: [{ method: "cash", amount: 126, tendered: 100 }] });
    expect(lowCash.body.message).toBe("Cash received is less than the cash amount");

    const zero = await pay(orderId, { payments: [{ method: "card", amount: 0 }] });
    expect(zero.body.message).toBe("Payment amounts must be more than zero");
  });

  it("still accepts a single payment method for the full amount", async () => {
    const orderId = await counterOrder(owner, [{ foodItemId: world.food.vada, quantity: 1 }]);
    const res = await pay(orderId, { paymentMethod: "wallet" });
    expect(res.body).toMatchObject({ status: "closed", paymentMethod: "wallet" });
    expect(res.body.payments).toEqual([expect.objectContaining({ method: "wallet", amount: 63 })]);
  });

  it("shares the restaurant's UPI details with the bill so a QR can be shown", async () => {
    await Restaurant.updateOne(
      { _id: world.restaurantId },
      { $set: { "billingSettings.upiVpa": "testkaffi@okicici", "billingSettings.upiPayeeName": "Test Kaffi" } }
    );
    const orderId = await counterOrder(owner, [{ foodItemId: world.food.vada, quantity: 1 }]);
    const detail = await api().get(`/api/orders/${orderId}`).set(bearer(owner));
    expect(detail.body.payment).toEqual({ upiVpa: "testkaffi@okicici", upiPayeeName: "Test Kaffi" });

    await api().post(`/api/orders/${orderId}/bill`).set(bearer(owner)).send({});
    const pdf = await api().get(`/api/orders/${orderId}/invoice/pdf`).set(bearer(owner));
    expect(pdf.status).toBe(200);
  });

  it("validates billing settings", async () => {
    const put = (billingSettings: object) =>
      api().put("/api/restaurant/settings").set(bearer(owner)).send({ billingSettings });
    expect((await put({ upiVpa: "not a upi id" })).body.message).toBe("Enter a valid UPI ID, like restaurant@okicici");
    expect((await put({ serviceChargePercent: 30 })).body.message).toBe("Service charge must be between 0% and 20%");
    expect((await put({ maxStaffDiscountPercent: 15 })).status).toBe(200);
  });
});

describe("service charge", () => {
  it("adds the restaurant's service charge before tax and lets staff waive it", async () => {
    await Restaurant.updateOne({ _id: world.restaurantId }, { $set: { "billingSettings.serviceChargePercent": 10 } });
    try {
      const orderId = await counterOrder(owner, [{ foodItemId: world.food.dosa, quantity: 1 }]);
      const withCharge = (await api().get(`/api/orders/${orderId}`).set(bearer(owner))).body.totals;
      expect(withCharge).toMatchObject({ subtotal: 120, serviceCharge: 12, taxableAmount: 132, grandTotal: 139 });

      await api().put(`/api/orders/${orderId}/service-charge`).set(bearer(owner)).send({ waived: true });
      const waived = (await api().get(`/api/orders/${orderId}`).set(bearer(owner))).body.totals;
      expect(waived).toMatchObject({ serviceCharge: 0, grandTotal: 126 });

      await api().put(`/api/orders/${orderId}/service-charge`).set(bearer(owner)).send({ waived: false });
      const billed = await api().post(`/api/orders/${orderId}/bill`).set(bearer(owner)).send({});
      expect(billed.body.bill).toMatchObject({ serviceChargePercent: 10, serviceCharge: 12, grandTotal: 139 });
    } finally {
      await Restaurant.updateOne({ _id: world.restaurantId }, { $set: { "billingSettings.serviceChargePercent": 0 } });
    }
  });
});
