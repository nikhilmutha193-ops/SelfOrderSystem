import jwt from "jsonwebtoken";
import { beforeAll, describe, expect, it } from "vitest";

import Customer from "../src/models/Customer";
import Order from "../src/models/Order";
import { loyaltyBalance } from "../src/modules/customers/loyalty";
import { api, bearer, createWorld, loginAdmin, seatTable, World } from "./fixtures";

let world: World;
let owner: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
});

const RAVI = "98450 11111";

async function takeaway(items: { foodItemId: string; quantity: number }[], phone = RAVI, name = "Ravi") {
  const res = await api()
    .post("/api/pos/orders")
    .set(bearer(owner))
    .send({ orderType: "takeaway", customerName: name, customerPhone: phone, items });
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  return res.body.order._id as string;
}

const pay = (orderId: string) =>
  api().patch(`/api/orders/${orderId}/pay`).set(bearer(owner)).send({ paymentMethod: "cash" });
const lookup = async (phone = RAVI) =>
  (
    await api()
      .get(`/api/customers/lookup?phone=${encodeURIComponent(phone)}`)
      .set(bearer(owner))
  ).body.customer;
const redeem = (orderId: string, points: number) =>
  api().post(`/api/customers/orders/${orderId}/redeem`).set(bearer(owner)).send({ points });

describe("recognising guests", () => {
  it("links a guest's dine-in order to a customer by phone", async () => {
    const seat = await seatTable(1, "Asha");
    const customer = await Customer.findOne({ phone: "919845000000" });
    expect(customer).toMatchObject({ name: "Asha", visitCount: 0 });
    expect((await Order.findById(seat.orderId))!.customerId!.toString()).toBe(customer!._id.toString());
  });

  it("counts a visit and spend when the bill is paid, with no points while loyalty is off", async () => {
    const orderId = await takeaway([{ foodItemId: world.food.vada, quantity: 1 }]);
    await pay(orderId);
    expect(await lookup()).toMatchObject({
      name: "Ravi",
      phone: "919845011111",
      visitCount: 1,
      totalSpend: 63,
      points: 0,
    });
  });
});

describe("loyalty points", () => {
  it("validates and saves the loyalty rules", async () => {
    const bad = await api()
      .put("/api/customers/settings")
      .set(bearer(owner))
      .send({ enabled: true, pointsPer100: -1, pointValue: 1, minRedeem: 20, expiryDays: 365 });
    expect(bad.status).toBe(400);
    const ok = await api()
      .put("/api/customers/settings")
      .set(bearer(owner))
      .send({ enabled: true, pointsPer100: 10, pointValue: 1, minRedeem: 20, expiryDays: 365 });
    expect(ok.status).toBe(200);
  });

  it("earns points on the paid total", async () => {
    const orderId = await takeaway([{ foodItemId: world.food.dosa, quantity: 2 }]);
    await pay(orderId);
    expect(await lookup()).toMatchObject({ visitCount: 2, totalSpend: 315, points: 25, pointsValue: 25 });
  });

  it("redeems points as a saved discount line on the bill", async () => {
    const orderId = await takeaway([{ foodItemId: world.food.dosa, quantity: 1 }]);
    const tooFew = await redeem(orderId, 10);
    expect(tooFew.status).toBe(400);
    expect(tooFew.body.message).toBe("Redeem at least 20 points");
    const tooMany = await redeem(orderId, 30);
    expect(tooMany.status).toBe(409);
    expect(tooMany.body.message).toBe("Only 25 points are available");

    const res = await redeem(orderId, 20);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ redeem: { points: 20, amount: 20 }, customer: { points: 5 } });

    const bill = await api().post(`/api/orders/${orderId}/bill`).set(bearer(owner)).send({});
    expect(bill.body.bill).toMatchObject({
      subtotal: 120,
      loyaltyDiscount: 20,
      discount: 20,
      taxableAmount: 100,
      grandTotal: 105,
    });
    await pay(orderId);
    expect(await lookup()).toMatchObject({ points: 15, visitCount: 3 });
  });

  it("refuses points worth more than the bill", async () => {
    await api()
      .put("/api/customers/settings")
      .set(bearer(owner))
      .send({ enabled: true, pointsPer100: 10, pointValue: 10, minRedeem: 1, expiryDays: 365 });
    const orderId = await takeaway([{ foodItemId: world.food.vada, quantity: 1 }]);
    const res = await redeem(orderId, 15);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("That's more than the bill. Use up to 6 points.");

    expect((await redeem(orderId, 5)).status).toBe(200);
    expect((await lookup()).points).toBe(10);
    const removed = await api().delete(`/api/customers/orders/${orderId}/redeem`).set(bearer(owner));
    expect(removed.body.redeem).toBeNull();
    expect((await lookup()).points).toBe(15);

    await redeem(orderId, 5);
    await api().patch(`/api/orders/${orderId}/cancel`).set(bearer(owner)).send({});
    expect((await lookup()).points).toBe(15);
  });

  it("takes back earned points and returns used points when a paid bill is voided", async () => {
    const orderId = await takeaway([{ foodItemId: world.food.dosa, quantity: 1 }]);
    await redeem(orderId, 3);
    await pay(orderId);
    const before = await lookup();
    expect(before).toMatchObject({ points: 12 + 9, visitCount: 4 });

    await api().post(`/api/orders/${orderId}/void`).set(bearer(owner)).send({ reason: "Wrong table" });
    expect(await lookup()).toMatchObject({ points: 15, visitCount: 3 });
  });

  it("expires points first-in, first-out", () => {
    const day = 24 * 60 * 60 * 1000;
    const now = new Date();
    const at = (d: number) => new Date(now.getTime() + d * day);
    const result = loyaltyBalance(
      [
        { type: "earn", points: 100, expiresAt: at(-1), createdAt: at(-30) },
        { type: "earn", points: 50, expiresAt: at(10), createdAt: at(-20) },
        { type: "redeem", points: -60, expiresAt: null, createdAt: at(-10) },
        { type: "earn", points: 40, expiresAt: at(200), createdAt: at(-5) },
      ],
      now
    );
    expect(result).toEqual({ balance: 90, expired: 40, expiringSoon: 50 });
  });
});

describe("customer list and profile", () => {
  it("searches, filters by segment and edits a profile", async () => {
    const found = await api().get("/api/customers?q=ravi").set(bearer(owner));
    expect(found.body.map((c: { name: string }) => c.name)).toEqual(["Ravi"]);
    const regulars = await api().get("/api/customers?segment=regulars").set(bearer(owner));
    expect(regulars.body.map((c: { name: string }) => c.name)).toEqual(["Ravi"]);

    const id = found.body[0]._id;
    const bad = await api().put(`/api/customers/${id}`).set(bearer(owner)).send({ name: "Ravi K", birthday: "13-40" });
    expect(bad.status).toBe(400);
    const today = new Date();
    const md = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const saved = await api()
      .put(`/api/customers/${id}`)
      .set(bearer(owner))
      .send({ name: "Ravi K", birthday: md, tags: ["vip", "vip"], marketingConsent: true });
    expect(saved.status).toBe(200);
    expect(saved.body.customer).toMatchObject({ name: "Ravi K", birthday: md, tags: ["vip"], marketingConsent: true });
    expect(saved.body.orders.length).toBeGreaterThanOrEqual(5);
    expect(saved.body.ledger[0]).toHaveProperty("type");

    const birthdays = await api().get("/api/customers?segment=birthdays").set(bearer(owner));
    expect(birthdays.body.map((c: { name: string }) => c.name)).toEqual(["Ravi K"]);
  });

  it("lets order staff look up guests but not browse the customer list", async () => {
    const manager = await loginAdmin("manager", "Manager@123");
    expect((await api().get(`/api/customers/lookup?phone=${RAVI}`).set(bearer(manager))).status).toBe(200);
    expect((await api().get("/api/customers").set(bearer(manager))).status).toBe(403);
  });

  it("attaches a guest to an existing order by phone", async () => {
    const res = await api().post("/api/orders/takeaway").set(bearer(owner)).send({ customerName: "Walk-in" });
    const attached = await api()
      .post(`/api/customers/orders/${res.body._id}/attach`)
      .set(bearer(owner))
      .send({ phone: "+91 99000 22222", name: "Meera" });
    expect(attached.status).toBe(200);
    expect(attached.body.customer).toMatchObject({ name: "Meera", phone: "919900022222" });
    expect((await Order.findById(res.body._id))!.customerName).toBe("Meera");
    const bad = await api()
      .post(`/api/customers/orders/${res.body._id}/attach`)
      .set(bearer(owner))
      .send({ phone: "123" });
    expect(bad.status).toBe(400);
  });
});

describe("bill links for WhatsApp", () => {
  let orderId: string;
  let token: string;

  it("shares only a billed order, with a WhatsApp link to the guest's number", async () => {
    orderId = await takeaway([{ foodItemId: world.food.coffee, quantity: 1 }]);
    const early = await api().post(`/api/bills/${orderId}/share`).set(bearer(owner));
    expect(early.status).toBe(409);
    await api().post(`/api/orders/${orderId}/bill`).set(bearer(owner)).send({});
    const res = await api()
      .post(`/api/bills/${orderId}/share`)
      .set({ ...bearer(owner), Origin: "https://kaffi.example" });
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^https:\/\/kaffi\.example\/bill\/.+/);
    expect(res.body.whatsappUrl).toMatch(/^https:\/\/wa\.me\/919845011111\?text=/);
    expect(decodeURIComponent(res.body.whatsappUrl)).toContain("Test Kaffi: bill ");
    token = res.body.url.split("/bill/")[1];
  });

  it("shows the bill to anyone with the link, and nothing more", async () => {
    const res = await api().get(`/api/bills/public/${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      restaurant: { name: "Test Kaffi" },
      order: { customerName: "Ravi", status: "billed" },
      items: [{ foodName: "Filter Coffee", quantity: 1 }],
      totals: { grandTotal: 105 },
    });
    expect(res.body.order.invoiceNumber).toMatch(/\/\d{6}$/);

    const pdf = await api().get(`/api/bills/public/${token}/pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");

    expect((await api().get(`/api/bills/public/${token}x`)).status).toBe(404);
    expect(
      (
        await api()
          .get("/api/orders")
          .set({ Authorization: `Bearer ${token}` })
      ).status
    ).toBe(401);
  });

  it("says when a link has expired", async () => {
    const expired = jwt.sign({ oid: orderId, rid: world.restaurantId }, `${process.env.JWT_SECRET}:bill-link`, {
      audience: "bill",
      expiresIn: -10,
    });
    const res = await api().get(`/api/bills/public/${expired}`);
    expect(res.status).toBe(410);
    expect(res.body.message).toBe("This bill link has expired. Ask the restaurant for a new one.");
  });
});
